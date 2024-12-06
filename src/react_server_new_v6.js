import { MongoClient } from 'mongodb';
import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import { vitruveo } from './chains/index.js';
import { factoryAbi } from './abis/factoryAbi.js';
import config from './config/index.js';
import { createPublicClient, getContract, http } from 'viem';
import { formatEther } from 'viem';

const { FACTORY_ADDRESS, DB_NAME, MONGO_URI } = config;
const collectionName = DB_NAME;
const wsPort = 8088;
const httpPort = 3003;
const startBlock = 6809140; // Skip blocks prior to this one

const cachedPools = new Map();

const publicClient = createPublicClient({
  chain: vitruveo,
  transport: http(),
});

const factory = getContract({
  abi: factoryAbi,
  address: FACTORY_ADDRESS,
  client: publicClient,
});

const client = new MongoClient(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const app = express();


let lastCheckedBlock = startBlock;
let cachedLiquidity = null;
let lastLiquidityCalculationBlock = startBlock;

app.get('/volume', async (req,res) => {
  const db = client.db(DB_NAME);
  const collection = db.collection(collectionName);
  

  const totalVolume = await collection.aggregate([
    {
      $match: { vtruAmount: { $exists: true } } 
    },
    {$addFields: {
      numericValue: { $toLong: "$vtruAmount" }
    }},
    {
      $group: {
        _id: null, 
        totalVtruAmount: { $sum: "$numericValue" } 
      }
    },
    {
      $project: { _id: 0, totalVtruAmount: 1 } // Step 3: Format the output
    }
  ]).toArray()

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const totalVolume24 = await collection.aggregate([
    {
      $match: { vtruAmount: { $exists: true }, timestamp: { $gte: oneDayAgo.valueOf() } } 
    },
    {$addFields: {
      numericValue: { $toLong: "$vtruAmount" }
    }},
    {
      $group: {
        _id: null, 
        totalVtruAmount24: { $sum: "$numericValue" } 
      }
    },
    {
      $project: { _id: 0, totalVtruAmount24: 1 }
    }
  ]).toArray()
  
  const totalVolumeNum = formatEther(totalVolume[0]?.totalVtruAmount || 0) 
  const totalVolume24Num = formatEther(totalVolume24[0]?.totalVtruAmount24|| 0) 

  res.json({
    totalVolume: totalVolumeNum,
    totalVolume24: totalVolume24Num
  })
})

async function createIndexes() {
  const db = client.db(DB_NAME);
  const collection = db.collection(collectionName);

  await collection.createIndex({ blockNumber: -1 });
  console.log('Index on blockNumber created');
}

async function getLatestTransactions(tokenAddress, page, limit) {
  const db = client.db(DB_NAME);
  const collection = db.collection(collectionName);

  const query = tokenAddress ? await getPairQueryV2(tokenAddress) : {};

  query.blockNumber = { $gte: startBlock };

  console.log('Fetching transactions with query:', JSON.stringify(query));
  console.log('Sorting by blockNumber in descending order');

  const transactions = await collection
    .find(query)
    .sort({ blockNumber: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  console.log(
    `Fetched ${transactions.length} transactions. First block: ${
      transactions[0]?.blockNumber
    }, Last block: ${transactions[transactions.length - 1]?.blockNumber}`
  );

  return transactions;
}

// async function calculateLiquidity(pair) {
//   const db = client.db(DB_NAME);
//   const collection = db.collection(collectionName);

//   const query = {
//     functionName: { $regex: /^addliquidity|^removeliquidity/i },
//     tokenTransfers: {
//       $elemMatch: {
//         token: '0xbcfb3fca16b12c7756cd6c24f1cc0ac0e38569cf', // USDC.POL token
//         to: '0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba', // WVTRU LP address
//       },
//     },
//   };

//   const transactions = await collection.find(query).toArray();

//   let liquidity = cachedLiquidity || 0;
//   transactions.forEach((tx) => {
//     tx.tokenTransfers.forEach((transfer) => {
//       if (
//         transfer.token === '0xbcfb3fca16b12c7756cd6c24f1cc0ac0e38569cf' &&
//         transfer.to === '0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba'
//       ) {
//         liquidity += parseFloat(transfer.amount);
//       }
//     });
//   });

//   cachedLiquidity = liquidity * 2; // Since it's a V2 LP, we double the liquidity.
//   lastLiquidityCalculationBlock =
//     transactions.length > 0
//       ? transactions[transactions.length - 1].blockNumber
//       : lastLiquidityCalculationBlock;

//   return cachedLiquidity;
// }

// async function getLiquidityData(pair) {
//   if (cachedLiquidity !== null) {
//     return cachedLiquidity;
//   }
//   return await calculateLiquidity(pair);
// }

async function get24HourData(tokenAddress) {
  const db = client.db(DB_NAME);
  const collection = db.collection(collectionName);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const query = tokenAddress ? await getPairQueryV2(tokenAddress) : {};
  query.blockNumber = { $gte: startBlock };
  query.timestamp = { $gte: oneDayAgo.getTime() };

  return await collection.find(query).toArray();
}

async function getTotalTransactionCount(tokenAddress) {
  const db = client.db(DB_NAME);
  const collection = db.collection(collectionName);

  const query = tokenAddress ? await getPairQueryV2(tokenAddress) : {};
  query.blockNumber = { $gte: startBlock };

  return await collection.countDocuments(query);
}

async function getPairQueryV2(tokenAddress) {
  let lpAddress = cachedPools.get(tokenAddress);

  if (!lpAddress) {
    lpAddress = await factory.read.getPool([tokenAddress]);
    cachedPools.set(tokenAddress, lpAddress);
  }

  return {
    token: tokenAddress.toLowerCase(),
  };
}

async function processTransaction(tx, wss) {
  console.log(
    `Relevant transaction detected: hash = ${tx.hash}, blockNumber = ${tx.blockNumber}`
  );
  const transactionData = JSON.stringify({ type: 'update', data: tx });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(transactionData);
    }
  });

  lastCheckedBlock = Math.max(lastCheckedBlock, tx.blockNumber);
}

async function pollDatabase(wss) {
  try {
    const db = client.db(DB_NAME);
    const collection = db.collection(collectionName);

    setInterval(async () => {
      try {
        console.log(
          `Checking for new transactions since block ${lastCheckedBlock}...`
        );
        const newTransactions = await collection
          .find({ blockNumber: { $gt: lastCheckedBlock } })
          .sort({ blockNumber: -1 })
          .toArray();

        for (const tx of newTransactions) {
          await processTransaction(tx, wss);
        }

        if (newTransactions.length) {
          console.log(`Processed ${newTransactions.length} new transactions`);
        }
      } catch (err) {
        console.error('Error during polling:', err);
      }
    }, 5000); // Poll every 5 seconds
  } catch (err) {
    console.error('Failed to connect to the database:', err);
  }
}

async function startServer() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    await createIndexes();

    const wss = new WebSocketServer({ port: wsPort });
    console.log(`WebSocket server running on ws://localhost:${wsPort}`);

    wss.on('connection', async (ws) => {
      console.log('New client connected');

      ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if (data.type === 'getHistorical') {
          const { tokenAddress, page, limit } = data;
          console.log({ data });

          const transactions = await getLatestTransactions(
            tokenAddress,
            page,
            limit
          );

          const data24h = await get24HourData(tokenAddress);
          const totalCount = await getTotalTransactionCount(tokenAddress);

          ws.send(
            JSON.stringify({
              type: 'historical',
              data: transactions,
              data24h,
              page,
              totalCount,
            })
          );
        }
      });
    });

    pollDatabase(wss);

    app.listen(httpPort, () => {
      console.log(`HTTP server running on http://localhost:${httpPort}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer().catch(console.error);
