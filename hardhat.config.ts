import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
export default {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 500 } } },
  networks: {
    hardhat: { chainId: 31337 },
    whitechainSepolia: {
      url: process.env.WHITECHAIN_RPC_URL || "https://rpc.testnet.whitechain.io",
      chainId: 1874,
      accounts: privateKey ? [privateKey] : []
    }
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" }
};
