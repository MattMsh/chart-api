import express from 'express';
import http from 'http';
import { createPublicClient, http as viemHttp, getContract } from 'viem';
import { retryOperation } from './utils/retryOperation.js';
import config from './config/index.js';
import { getApiCounterProvider } from './providers/ApiCallCounterProvider.js';
import { getMongoDB } from './db/mongoConnector.js';
import { vitruveo } from './chains/index.js';
import { factoryAbi } from './abis/factoryAbi.js';
import { poolAbi } from './abis/poolAbi.js';

const { PORT, FACTORY_ADDRESS } = config;

const app = express();
const server = http.createServer(app);

const publicClient = createPublicClient({
  chain: vitruveo,
  transport: viemHttp(),
});

const factory = getContract({
  abi: factoryAbi,
  address: FACTORY_ADDRESS,
  client: publicClient,
});

const tokensPools = new Map();
const poolsTokens = new Map();

async function loadPoolsAndTokens() {
  const factoryTokens = await factory.read.getAllTokens();
  await Promise.all(
    factoryTokens.map(async (token) => {
      const pool = await factory.read.getPool([token]);
      const poolLowerCase = pool.toLowerCase();
      const tokenLowerCase = token.toLowerCase();

      tokensPools.set(tokenLowerCase, poolLowerCase);
      poolsTokens.set(poolLowerCase, tokenLowerCase);
    })
  );
}

const BLOCK_TIME = 5000; // 5 seconds per block
const MAX_BLOCKS_TO_PROCESS = 100; // Process up to 10 blocks at once when behind

let db;
let lastCheckedBlock = 0;
let allTransactions = {};
let hasChanges = false;

const provider = getApiCounterProvider();

async function loadStoredData() {
  try {
    const lastBlockDoc = await db
      .collection('blockchain_data')
      .findOne({ _id: 'lastCheckedBlock' });

    lastCheckedBlock = lastBlockDoc ? lastBlockDoc.value : 0;

    const transactionsCursor = db
      .collection('blockchain_data')
      .find({ _id: { $ne: 'lastCheckedBlock' } });
    allTransactions = await transactionsCursor.toArray().then((docs) =>
      docs.reduce((acc, doc) => {
        acc[doc._id] = doc;
        return acc;
      }, {})
    );

    console.log(
      `Loaded data: Last checked block ${lastCheckedBlock}, ${
        Object.keys(allTransactions).length
      } stored transactions`
    );
  } catch (error) {
    console.error('Error loading stored data:', error);
    lastCheckedBlock = 0;
    allTransactions = {};
  }
}

async function saveData() {
  if (!hasChanges) {
    console.log('No changes to save');
    return;
  }

  try {
    await db
      .collection('blockchain_data')
      .updateOne(
        { _id: 'lastCheckedBlock' },
        { $set: { value: lastCheckedBlock } },
        { upsert: true }
      );

    const operations = Object.entries(allTransactions).map(([key, value]) => ({
      replaceOne: {
        filter: { _id: key },
        replacement: { _id: key, ...value },
        upsert: true,
      },
    }));

    console.dir({ operations }, { depth: Infinity });

    if (operations.length > 0) {
      await db.collection('blockchain_data').bulkWrite(operations);
    }

    console.log(
      `Data saved successfully. Last checked block: ${lastCheckedBlock}, Stored transactions: ${
        Object.keys(allTransactions).length
      }`
    );
    hasChanges = false;
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

async function processBlock(blockNumber) {
  // console.log(
  //   `Processing block ${block.number} with ${block.transactions.length} transactions`
  // );

  const block = await retryOperation(() =>
    provider.getBlock(blockNumber, true)
  );

  if (block.transactions.length <= 0) {
    return;
  }

  const poolCreatedLogs = await publicClient.getContractEvents({
    blockHash: block.hash,
    abi: factoryAbi,
    eventName: 'PoolCreated',
  });

  if (poolCreatedLogs.length > 0) {
    const [log] = poolCreatedLogs;
    const poolAddress = log.args.pool.toLowerCase();
    const tokenAddress = log.args.token.toLowerCase();

    tokensPools.set(tokenAddress, poolAddress);
    poolsTokens.set(poolAddress, tokenAddress);
  }

  const logs = await publicClient.getContractEvents({
    abi: poolAbi,
    blockHash: block.hash,
    eventName: 'Action',
    address: Array.from(poolsTokens.keys()),
  });

  for (const log of logs) {
    const { transactionHash, blockNumber, args } = log;
    const [, initiator, tokenAmount, vtruAmount, actionType] = args;
    const poolAddress = log.address;
    const action = actionType === 0 ? 'buy' : 'sell';

    allTransactions[`${transactionHash}_${log.logIndex}`] = {
      token: poolsTokens.get(log.address),
      hash: transactionHash,
      blockNumber,
      pool: poolAddress,
      client: initiator,
      action,
      tokenAmount: String(tokenAmount),
      vtruAmount: String(vtruAmount),
      timestamp: block.timestamp * 1000,
    };

    hasChanges = true;
  }
}

async function continuousMonitoring() {
  while (true) {
    const startTime = Date.now();

    try {
      const latestBlock = await retryOperation(() => provider.getBlockNumber());
      if (lastCheckedBlock === 0) {
        lastCheckedBlock = latestBlock;
      }

      if (latestBlock > lastCheckedBlock) {
        console.log(
          `Current latest block: ${latestBlock}, Last checked block: ${lastCheckedBlock}`
        );

        const blocksToProcess = Math.min(
          latestBlock - lastCheckedBlock,
          MAX_BLOCKS_TO_PROCESS
        );

        const handlesBlocks = [];
        for (let i = 0; i < blocksToProcess; i++) {
          handlesBlocks.push(processBlock(lastCheckedBlock));
          lastCheckedBlock++;
        }
        await Promise.all(handlesBlocks);

        if (hasChanges) {
          await saveData();
        }

        // If we're still behind, continue immediately
        if (latestBlock > lastCheckedBlock) {
          continue;
        }
      } else {
        console.log(
          `No new blocks. Current: ${latestBlock}, Last checked: ${lastCheckedBlock}`
        );
      }
    } catch (error) {
      console.error('Error in monitoring cycle:', error);
    }

    // Wait until the next block is expected
    const elapsedTime = Date.now() - startTime;
    const waitTime = Math.max(BLOCK_TIME - elapsedTime, 0);
    console.log({ waitTime });

    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

// app.get('/api/blockchain-data', async (req, res) => {
//   console.log('Received request for /api/blockchain-data');
//   try {
//     const startBlock = parseInt(req.query.startBlock) || 0;
//     const limit = parseInt(req.query.limit) || 100;
//     const skip = parseInt(req.query.skip) || 0;

//     const relevantAddresses = [
//       TOKEN_ADDRESSES.WVTRU,
//       TOKEN_ADDRESSES.VTRO,
//       TOKEN_ADDRESSES.USDC,
//       TOKEN_ADDRESSES.TKN,
//       TOKEN_ADDRESSES.PAIRS['WVTRU-USDC.POL'],
//       PAIRS['VTRO-USDC.POL'],
//     ];

//     const validFunctionNames = [
//       'swapExactTokensForTokens',
//       'swapTokensForExactTokens',
//       'addLiquidity',
//       'removeLiquidity',
//     ];

//     const transactions = await db
//       .collection('blockchain_data')
//       .find({
//         _id: { $ne: 'lastCheckedBlock' },
//         blockNumber: { $gte: startBlock },
//         $or: [
//           { from: { $in: relevantAddresses } },
//           { to: { $in: relevantAddresses } },
//           { 'tokenTransfers.token': { $in: relevantAddresses } },
//           { 'tokenTransfers.from': { $in: relevantAddresses } },
//           { 'tokenTransfers.to': { $in: relevantAddresses } },
//         ],
//         functionName: { $in: validFunctionNames },
//       })
//       .sort({ blockNumber: -1 })
//       .skip(skip)
//       .limit(limit)
//       .toArray();

//     const totalCount = await db.collection('blockchain_data').countDocuments({
//       _id: { $ne: 'lastCheckedBlock' },
//       blockNumber: { $gte: startBlock },
//       $or: [
//         { from: { $in: relevantAddresses } },
//         { to: { $in: relevantAddresses } },
//         { 'tokenTransfers.token': { $in: relevantAddresses } },
//         { 'tokenTransfers.from': { $in: relevantAddresses } },
//         { 'tokenTransfers.to': { $in: relevantAddresses } },
//       ],
//       functionName: { $in: validFunctionNames },
//     });

//     const lastCheckedBlock = await db
//       .collection('blockchain_data')
//       .findOne({ _id: 'lastCheckedBlock' });

//     res.json({
//       lastCheckedBlock: lastCheckedBlock ? lastCheckedBlock.value : 0,
//       totalCount,
//       transactions: transactions.reduce((acc, tx) => {
//         acc[tx._id] = tx;
//         return acc;
//       }, {}),
//     });
//   } catch (error) {
//     console.error('Error reading blockchain data:', error);
//     res
//       .status(500)
//       .json({ error: 'Internal Server Error', message: error.message });
//   }
// });

// app.get('/transactions', (req, res) => {
//   const { from, to, value, data, functionName } = req.query;
//   const criteria = {};
//   if (from) criteria.from = from;
//   if (to) criteria.to = to;
//   if (value) criteria.value = value;
//   if (data) criteria.data = data;
//   if (functionName) criteria.functionName = functionName;

//   const filteredTransactions = Object.values(allTransactions).filter((tx) => {
//     return Object.entries(criteria).every(([key, value]) => {
//       if (key === 'functionName' && tx.functionName) {
//         return tx.functionName.toLowerCase().includes(value.toLowerCase());
//       }
//       if (typeof value === 'string') {
//         return tx[key].toLowerCase().includes(value.toLowerCase());
//       } else if (Array.isArray(value)) {
//         return value.some((v) =>
//           tx[key].toLowerCase().includes(v.toLowerCase())
//         );
//       }
//       return tx[key] === value;
//     });
//   });

//   res.json(filteredTransactions);
// });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    stack: err.stack,
  });
});

// Start server and initialize monitoring
server
  .listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    db = await getMongoDB();
    await loadStoredData();
    await loadPoolsAndTokens();
    continuousMonitoring().catch(console.error);
  })
  .on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Please choose a different port.`
      );
    } else {
      console.error('Failed to start server:', error);
    }
    process.exit(1);
  });

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await saveData();
  console.log(`Total API calls made: ${provider.apiCallCount}`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
