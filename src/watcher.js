import express from 'express';
import http from 'http';
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

const { PORT } = config;

const app = express();
const server = http.createServer(app);

let lastCheckedBlock = 0;

async function loadStoredData() {
  try {
    const lastBlockDoc = await db
      .collection('blockchain_data')
      .findOne({ _id: 'lastCheckedBlock' });

    lastCheckedBlock = lastBlockDoc ? lastBlockDoc.value : 0;

    console.log(`Loaded data: Last checked block ${lastCheckedBlock}`);
  } catch (error) {
    console.error('Error loading stored data:', error);
    lastCheckedBlock = 0;
  }
}

async function saveData(transactions) {
  try {
    await db
      .collection('blockchain_data')
      .updateOne(
        { _id: 'lastCheckedBlock' },
        { $set: { value: lastCheckedBlock } },
        { upsert: true }
      );

    const operations = transactions.map((tx) => {
      const id = tx.id;
      delete tx.id;

      return {
        replaceOne: {
          filter: { _id: id },
          replacement: { _id: id, ...tx },
          upsert: true,
        },
      };
    });

    if (operations.length > 0) {
      await db.collection('blockchain_data').bulkWrite(operations);
    }

    console.log(
      `Data saved successfully. Last checked block: ${lastCheckedBlock}`
    );
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

async function processEventLog(log) {
  const { transactionHash, blockNumber, args } = log;
  const block = await publicClient.getBlock({ blockNumber });

  const [, initiator, tokenAmount, vtruAmount, actionType] = args;
  const poolAddress = log.address.toLowerCase();
  const action = actionType === 0 ? 'buy' : 'sell';

  return {
    id: `${transactionHash}_${log.logIndex}`,
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
}

function processEventLogs(logs) {
  return Promise.all(logs.map((log) => processEventLog(log)));
}

function getActionEventLogs(blockHash) {
  return publicClient.getContractEvents({
    abi: poolAbi,
    blockHash,
    eventName: 'Action',
    address: Array.from(getTokenByPool.keys()),
  });
}

async function processBlock(block) {
  if (block.transactions.length === 0) {
    return;
  }

  const poolCreatedLogs = await publicClient.getContractEvents({
    blockHash: block.hash,
    abi: factoryAbi,
    eventName: 'PoolCreated',
  });

  if (poolCreatedLogs.length > 0) {
    updateCache(poolCreatedLogs);
  }

  const logs = await getActionEventLogs(block.hash);
  const processedLogs = await processEventLogs(logs);
  await saveData(processedLogs);
}

async function continuousMonitoring() {
  const events = await publicClient.getContractEvents({
    abi: poolAbi,
    address: Array.from(getTokenByPool.keys()),
    fromBlock: BigInt(lastCheckedBlock),
    eventName: 'Action',
    strict: true,
  });

  const eventsToSave = await processEventLogs(events);
  lastCheckedBlock = await publicClient.getBlockNumber();
  await saveData(eventsToSave);

  publicClient.watchBlocks({
    onBlock: async (block) => {
      lastCheckedBlock = block.number;
      await processBlock(block);
    },
    onError: (error) => {
      console.error('Error in WATCH BLOCKS: ', error);
    },
  });
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
    continuousMonitoring();
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
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
