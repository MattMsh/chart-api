import abiDecoder from 'abi-decoder';
import { Interface } from 'ethers';
import { functionSignatures } from '../functionSignatures.js';
import { COMMON_ABI } from '../constants/abis.js';

abiDecoder.addABI(COMMON_ABI);

const abiInterfaces = COMMON_ABI.map((abiEntry) => {
  try {
    return new Interface([abiEntry]);
  } catch (error) {
    console.warn(
      `Failed to create interface for ABI entry: ${JSON.stringify(abiEntry)}`,
      error
    );
    return null;
  }
});

export function decodeTransactionInput(data) {
  try {
    const decodedData = abiDecoder.decodeMethod(data);
    if (decodedData) {
      return {
        functionName: decodedData.name,
        params: decodedData.params.reduce((acc, param) => {
          acc[param.name] = param.value;
          return acc;
        }, {}),
      };
    }

    for (const iface of abiInterfaces) {
      if (iface) {
        try {
          const result = iface.parseTransaction({ data });
          if (result) {
            return {
              functionName: result.name,
              params: result.args,
            };
          }
        } catch (ethersError) {
          // This interface didn't match, continue to the next one
        }
      }
    }

    const functionSignature = data.slice(0, 10);
    const functionInfo = functionSignatures[functionSignature];
    if (functionInfo) {
      return {
        functionName: functionInfo.name,
        params: {},
      };
    }

    return {
      functionName: `Unknown (${functionSignature})`,
      params: {},
    };
  } catch (error) {
    console.error('Error decoding transaction input:', error);
    return {
      functionName: 'Decoding Error',
      params: {},
    };
  }
}
