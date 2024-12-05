const functionSignatures = {
  '0x4982e3b7': {
    name: 'unwrapAll',
    inputs: [],
  },
  '0x60806040': {
    name: 'createContract',
    inputs: [],
  },
  '0x8129fc1c': {
    name: 'initialize',
    inputs: [],
  },
  '0x9d54ded8': {
    name: 'roulette',
    inputs: [
      { type: 'uint8[]', name: 'guesses' },
      { type: 'uint8[]', name: 'guessTypes' },
      { type: 'uint256[]', name: 'betAmounts' },
    ],
  },
  '0xa694fc3a': {
    name: 'stake',
    inputs: [{ type: 'uint256', name: 'amount' }],
  },
  '0xa9059cbb': {
    name: 'transfer',
    inputs: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'amount' },
    ],
  },
  '0x23b872dd': {
    name: 'transferFrom',
    inputs: [
      { type: 'address', name: 'from' },
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'tokenId' },
    ],
  },
  '0xd46eb119': {
    name: 'wrap',
    inputs: [],
  },
  '0x2e17de78': {
    name: 'unstake',
    inputs: [],
  },
  '0xa1705d06': {
    name: 'flipit',
    inputs: [],
  },
  '0xb88a802f': {
    name: 'claimreward',
    inputs: [],
  },
  '0x464faccc': {
    name: 'minttokens',
    inputs: [],
  },
  '0x47cff018': {
    name: 'createvault',
    inputs: [],
  },
  '0xc3de453d': {
    name: 'bridge',
    inputs: [],
  },
  '0x2f2ff15d': {
    name: 'grantrole',
    inputs: [],
  },
  '0x2195995c': {
    name: 'removeliquiditywithpermit',
    inputs: [],
  },
  '0xbaa2abde': {
    name: 'removeliquidity',
    inputs: [],
  },
  '0xfc8b7cc1': {
    name: 'initiateotctrade',
    inputs: [],
  },
  '0x2def6620': {
    name: 'unstake',
    inputs: [],
  },
  '0xa82ba76f': {
    name: 'buyNFT',
    inputs: [],
  },
  '0x4d31dd96': {
    name: 'issuevibeNFT',
    inputs: [],
  },
  '0x2f57ee41': {
    name: 'stake',
    inputs: [],
  },
  '0xf2fde38b': {
    name: 'transferownership',
    inputs: [],
  },
  '0x35ed71a8': {
    name: 'setswapstatus',
    inputs: [],
  },
  '0xe6d22501': {
    name: 'stake',
    inputs: [],
  },
  '0x49374246': {
    name: 'consign',
    inputs: [],
  },
  '0x4bfe11a5': {
    name: 'consign',
    inputs: [],
  },
  '0x31df7a62': {
    name: 'claimstudio',
    inputs: [],
  },
  '0x8f751b35': {
    name: 'addlicense',
    inputs: [],
  },
  '0xefd0cbf9': {
    name: 'mintpublic',
    inputs: [],
  },
  '0xe7a33822': {
    name: 'seal',
    inputs: [],
  },
  '0x2b416e94': {
    name: 'unseal',
    inputs: [],
  },
  '0x3f2e909c': {
    name: 'createtransfer',
    inputs: [],
  },
  '0x5f832177': {
    name: 'canceltransfer',
    inputs: [],
  },
  '0x0cac54ed': {
    name: 'claimtransfer',
    inputs: [],
  },
  '0xb209e7c2': {
    name: 'remholder',
    inputs: [],
  },
  '0xd0e30db0': {
    name: 'deposit',
    inputs: [],
  },
  '0x13495af1': {
    name: 'newholder',
    inputs: [],
  },
  '0x9d5c6e07': {
    name: 'batchmintboosters',
    inputs: [],
  },
  '0xee3178dc': {
    name: 'claimrevsharebyowner',
    inputs: [],
  },
  '0xac9650d8': {
    name: 'multicall',
    inputs: [],
  },
  '0x': {
    name: 'transfer',
    inputs: [],
  },
  '0xe8e33700': {
    name: 'addliquidity',
    inputs: [
      { type: 'address', name: 'tokenA' },
      { type: 'address', name: 'tokenB' },
      { type: 'address', name: 'to' },
    ],
  },
  '0xad05f1b4': {
    name: 'listNFT',
    inputs: [],
  },
  '0x305a67a8': {
    name: 'cancellisting',
    inputs: [],
  },
  '0x1e83409a': {
    name: 'claim',
    inputs: [],
  },
};

// Function to add new signatures easily
function addFunctionSignature(methodId, name, inputs = []) {
  functionSignatures[methodId] = { name, inputs };
}

// Example usage to add a new function
// addFunctionSignature("0xnewsignature", "newFunction", [{ type: "uint256", name: "param1" }]);

export { functionSignatures, addFunctionSignature };
