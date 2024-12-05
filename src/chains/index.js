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
    default: { http: ['https://rpc.vitruveo.xyz/'] },
  },
  blockExplorers: {
    default: {
      name: 'Vitruveo Explorer',
      url: 'https://explorer.vitruveo.xyz/',
      apiUrl: 'https://explorer-new.vitruveo.xyz/api/v2',
    },
  },
});
