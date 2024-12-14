import express from 'express';
import http from 'http';
import { retryOperation } from './utils/retryOperation.js';
import config from './config/index.js';
import { connectMongoDB, db } from './db/mongoConnector.js';
import { factoryAbi } from './abis/factoryAbi.js';
import { poolAbi } from './abis/poolAbi.js';
import {
  updateCache,
  loadPoolsAndTokens,
  getTokenByPool,
} from './services/cachePoolAndToken.js';
import { publicClient } from './viemClient.js';
import { getAddress, parseAbiItem, parseEventLogs } from 'viem';
import { log } from 'console';

const { PORT } = config;

const app = express();
const server = http.createServer(app);

const BLOCK_TIME = 5000; // 5 seconds per block
const MAX_BLOCKS_TO_PROCESS = 100; // Process up to 10 blocks at once when behind

let lastCheckedBlock = 0;
let allTransactions = {};
let hasChanges = false;

const watchEvents = async () => {
  const event = parseAbiItem(
    'event Action(address indexed factory, address, uint256, uint256, uint256, string)'
  );

  const pools = Array.from(getTokenByPool.keys()).map((address) =>
    getAddress(address)
  );

  const unwatch = publicClient.watchBlocks({
    onBlock: async (block) => {
      const logs = await publicClient.getContractEvents({
        address: pools,
        abi: poolAbi,
        eventName: 'Action',
        blockHash: block.hash,
      });

      log(logs);
    },
  });
};

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
  const block = await retryOperation(() =>
    publicClient.getBlock(blockNumber, true)
  );

  if (block.transactions.length <= 0) {
    return;
  }

  const poolCreatedLogs = await publicClient.getContractEvents({
    blockHash: block.hash,
    abi: factoryAbi,
    eventName: 'PoolCreated',
  });

  updateCache(poolCreatedLogs);

  const logs = await publicClient.getContractEvents({
    abi: poolAbi,
    blockHash: block.hash,
    eventName: 'Action',
    address: Array.from(getTokenByPool.keys()),
  });

  for (const log of logs) {
    const { transactionHash, blockNumber, args } = log;
    const [, initiator, tokenAmount, vtruAmount, actionType] = args;
    const poolAddress = log.address.toLowerCase();
    const action = actionType === 0 ? 'buy' : 'sell';

    allTransactions[`${transactionHash}_${log.logIndex}`] = {
      token: getTokenByPool.get(log.address),
      hash: transactionHash,
      blockNumber,
      pool: poolAddress,
      client: initiator,
      action,
      tokenAmount: String(tokenAmount),
      vtruAmount: String(vtruAmount),
      timestamp: Number(block.timestamp) * 1000,
    };

    hasChanges = true;
  }
}

async function continuousMonitoring() {
  while (true) {
    const startTime = Date.now();

    try {
      const latestBlock = await retryOperation(() =>
        publicClient.getBlockNumber()
      ).then((value) => Number(value));
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
    await connectMongoDB();
    await loadStoredData();
    await loadPoolsAndTokens();
    // await watchEvents();
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
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
