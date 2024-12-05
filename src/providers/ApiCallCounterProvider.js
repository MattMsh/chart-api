import { JsonRpcProvider } from 'ethers';
import config from '../config/index.js';

export class ApiCallCounterProvider extends JsonRpcProvider {
  constructor(url, network) {
    super(url, network);
    this.chainId = null;
    this.apiCallCount = 0;
  }

  async send(method, params) {
    if (method === 'eth_chainId' && this.chainId !== null) {
      return this.chainId;
    }

    this.apiCallCount++;
    // console.log(`API Call #${apiCallCount}: ${method}`);
    const result = await super.send(method, params);

    if (method === 'eth_chainId' && this.chainId === null) {
      this.chainId = result;
    }

    return result;
  }
}

export const getApiCounterProvider = () => {
  const { RPC_URL } = config;

  try {
    const provider = new ApiCallCounterProvider(RPC_URL);
    provider.getNetwork().then(() => {
      console.log('ChainId fetched and cached');
    });
    return provider;
  } catch (error) {
    console.error('Failed to connect to RPC:', error);
    process.exit(1);
  }
};
