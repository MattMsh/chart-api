import { isAddress } from 'viem';
import { factory, factoryV2 } from '../contracts/index.js';

const getPoolByToken = new Map();
const getTokenByPool = new Map();

async function loadPoolsAndTokensByFactory(factory) {
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

async function loadPoolsAndTokens() {
  [factory, factoryV2]
    .filter((contract) => isAddress(contract.address))
    .forEach(async (factory) => {
      await loadPoolsAndTokensByFactory(factory);
    });
}

function updateCache(logs) {
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
