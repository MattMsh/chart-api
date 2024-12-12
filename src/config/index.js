import dotenv from 'dotenv';

dotenv.config();

const config = {
  PORT: process.env.PORT || 3001,
  RPC_URL: process.env.RPC_URL,
  MONGO_URI: process.env.MONGO_URI,
  DB_NAME: process.env.DB_NAME,
  FACTORY_ADDRESS: process.env.FACTORY_ADDRESS,
  WVTRU_ADDRESS: process.env.WVTRU_ADDRESS,
  LOCAL_CHAIN: process.env.LOCAL_CHAIN,
};

export default config;
