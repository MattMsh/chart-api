import { isAddress } from 'viem';
import { factory, factoryV2, factoryV3 } from '../contracts/index.js';

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
  await Promise.all(
    [factory, factoryV2, factoryV3]
      .filter((contract) => isAddress(contract.address))
      .map((factory) => loadPoolsAndTokensByFactory(factory))
  );
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
