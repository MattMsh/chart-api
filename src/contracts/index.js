import { getContract } from 'viem';
import { factoryAbi } from '../abis/factoryAbi.js';
import { publicClient } from '../viemClient.js';
import config from '../config/index.js';

const { FACTORY_ADDRESS, FACTORY_V2_ADDRESS } = config;

export const factory = getContract({
  abi: factoryAbi,
  address: FACTORY_ADDRESS,
  client: publicClient,
});

export const factoryV2 = getContract({
  abi: factoryAbi,
  address: FACTORY_V2_ADDRESS,
  client: publicClient,
});
