import { getContract } from 'viem';
import { factoryAbi } from '../abis/factoryAbi.js';
import config from '../config/index.js';
import { publicClient } from '../viemClient.js';

const { FACTORY_ADDRESS } = config;

const getPoolByToken = new Map();
const getTokenByPool = new Map();

const factory = getContract({
  abi: factoryAbi,
  address: FACTORY_ADDRESS,
  client: publicClient,
});

async function loadPoolsAndTokens() {
  const factoryTokens = await factory.read.getAllTokens();
  await Promise.all(
    factoryTokens.map(async (token) => {
      const pool = await factory.read.getPool([token]);
      const poolLowerCase = pool.toLowerCase();
      const tokenLowerCase = token.toLowerCase();

      getPoolByToken.set(tokenLowerCase, poolLowerCase);
      getTokenByPool.set(poolLowerCase, tokenLowerCase);
    })
  );
}

function updateCache(logs) {
  if (logs.length < 1) {
    return;
  }
  logs.forEach((log) => {
    const poolAddress = log.args.pool.toLowerCase();
    const tokenAddress = log.args.token.toLowerCase();

    if (!getPoolByToken.get(tokenAddress)) {
      getPoolByToken.set(tokenAddress, poolAddress);
    }

    if (!getTokenByPool.get(poolAddress)) {
      getTokenByPool.set(poolAddress, tokenAddress);
    }
  });
}

export { getPoolByToken, getTokenByPool, loadPoolsAndTokens, updateCache };
