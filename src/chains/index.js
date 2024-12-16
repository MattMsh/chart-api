import { defineChain } from 'viem';

export const vitruveo = defineChain({
  id: 1490,
  name: 'Vitruveo',
  nativeCurrency: {
    name: 'Vitruveo',
    symbol: 'VTRU',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.vitruveo.xyz/'],
      webSocket: ['ws://77.237.237.200:8546'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Vitruveo Explorer',
      url: 'https://explorer.vitruveo.xyz/',
      apiUrl: 'https://explorer-new.vitruveo.xyz/api/v2',
    },
  },
});

export const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: {
    name: 'Anvil',
    symbol: 'ANV',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
      webSocket: ['ws://127.0.0.1:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Vitruveo Explorer',
      url: 'https://explorer.vitruveo.xyz/',
      apiUrl: 'https://explorer-new.vitruveo.xyz/api/v2',
    },
  },
});
