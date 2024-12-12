import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import { formatEther, getContract } from 'viem';

import config from './config/index.js';
import { factoryAbi } from './abis/factoryAbi.js';
import { poolAbi } from './abis/poolAbi.js';
import { publicClient } from './viemClient.js';
import { db, connectMongoDB } from './db/mongoConnector.js';
import { getPoolByToken } from './services/cachePoolAndToken.js';

const { FACTORY_ADDRESS, DB_NAME, WS_CLIENT_API_PORT, CLIENT_API_PORT } =
  config;
const collectionName = DB_NAME;
const wsPort = WS_CLIENT_API_PORT;
const httpPort = CLIENT_API_PORT;

const factory = getContract({
  abi: factoryAbi,
  address: FACTORY_ADDRESS,
  client: publicClient,
});

const app = express();

let lastCheckedBlock = startBlock;

const getVolume = async () => {
  const collection = db.collection(collectionName);

  const totalVolumeAmounts = await collection
    .find({ vtruAmount: { $exists: true } })
    .toArray();

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const totalVolume24Amounts = await collection
    .find({
      vtruAmount: { $exists: true },
      timestamp: { $gte: oneDayAgo.valueOf() },
    })
    .toArray();

  const totalVolumeNum = totalVolumeAmounts
    .reduce((sum, record) => sum + +formatEther(BigInt(record.vtruAmount)), 0)
    .toFixed(2);
  const totalVolume24Num = totalVolume24Amounts
    .reduce((sum, record) => sum + +formatEther(BigInt(record.vtruAmount)), 0)
    .toFixed(2);

  return { volume: totalVolumeNum, volume24: totalVolume24Num };
};

const getLiquidity = async () => {
  const tokens = await factory.read.getAllTokens();
  const pools = await Promise.all(
    tokens.map((token) => factory.read.getPool([token]))
  );
  const balances = await Promise.all(
    pools.map((pool) =>
      publicClient.readContract({
        abi: poolAbi,
        address: pool,
        functionName: 'realCoinBalance',
      })
    )
  );

  const liquidity = balances
    .reduce((sum, amount) => sum + +formatEther(amount), 0)
    .toFixed(2);

  return liquidity;
};

app.get('/metrics', async (req, res) => {
  const { volume, volume24 } = await getVolume();
  const liquidity = await getLiquidity();

  res.json({
    volume,
    volume24,
    liquidity,
  });
});

async function createIndexes() {
  const collection = db.collection(collectionName);

  await collection.createIndex({ blockNumber: -1 });
  console.log('Index on blockNumber created');
}

async function getLatestTransactions(tokenAddress, page, limit) {
  const collection = db.collection(collectionName);

  const query = tokenAddress ? await getPairQueryV2(tokenAddress) : {};

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

async function get24HourData(tokenAddress) {
  const collection = db.collection(collectionName);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const query = tokenAddress ? await getPairQueryV2(tokenAddress) : {};
  query.timestamp = { $gte: oneDayAgo.getTime() };

  return await collection.find(query).toArray();
}

async function getTotalTransactionCount(tokenAddress) {
  const collection = db.collection(collectionName);

  const query = tokenAddress ? await getPairQueryV2(tokenAddress) : {};

  return await collection.countDocuments(query);
}

async function getPairQueryV2(tokenAddress) {
  let lpAddress = getPoolByToken.get(tokenAddress);

  if (!lpAddress) {
    lpAddress = await factory.read.getPool([tokenAddress]);
    getPoolByToken.set(tokenAddress, lpAddress);
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
    await connectMongoDB();
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
