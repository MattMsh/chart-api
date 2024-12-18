import dotenv from 'dotenv';

dotenv.config();

const config = {
  PORT: process.env.PORT || 3001,
  MONGO_URI: process.env.MONGO_URI,
  DB_NAME: process.env.DB_NAME,
  FACTORY_ADDRESS: process.env.FACTORY_ADDRESS,
  FACTORY_V2_ADDRESS: process.env.FACTORY_V2_ADDRESS,
  WVTRU_ADDRESS: process.env.WVTRU_ADDRESS,
  LOCAL_CHAIN: process.env.LOCAL_CHAIN,
  WS_CLIENT_API_PORT: process.env.WS_CLIENT_API_PORT,
  CLIENT_API_PORT: process.env.CLIENT_API_PORT,
};

export default config;
