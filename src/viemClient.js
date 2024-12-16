import { createPublicClient, webSocket } from 'viem';
import { anvil, vitruveo } from './chains/index.js';
import config from './config/index.js';

const { LOCAL_CHAIN } = config;

export const publicClient = createPublicClient({
  chain: LOCAL_CHAIN ? anvil : vitruveo,
  transport: webSocket(),
  pollingInterval: 5000,
});
