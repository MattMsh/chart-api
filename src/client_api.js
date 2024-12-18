import WebSocket, { WebSocketServer } from 'ws';
import config from './config/index.js';
import { db, connectMongoDB } from './db/mongoConnector.js';
import { getPoolByToken } from './services/cachePoolAndToken.js';
import { factory, factoryV2 } from './contracts/index.js';

const { DB_NAME, WS_CLIENT_API_PORT } = config;
const collectionName = DB_NAME;

let lastCheckedBlock = 0;

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
    if (!lpAddress && factoryV2.address) {
      lpAddress = await factoryV2.read.getPool([tokenAddress]);
    }
    getPoolByToken.set(tokenAddress, lpAddress);
  }

  return {
    token: tokenAddress.toLowerCase(),
  };
}

async function processTransaction(tx, wss) {
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

    await createIndexes();

    const wss = new WebSocketServer({ port: WS_CLIENT_API_PORT });
    console.log(
      `WebSocket server running on ws://localhost:${wss.options.port}`
    );

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
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer().catch(console.error);
