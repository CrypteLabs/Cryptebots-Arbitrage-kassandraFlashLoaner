require("@nomiclabs/hardhat-waffle");
require	("@openzeppelin/hardhat-upgrades");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.6.6",
  networks: { /* fork mainnet */
    hardhat: {
      forking: {
        url: "https://eth-ropsten.alchemyapi.io/v2/PgqBQMd8eN9KkJBZi50I4D2Kg3u2O_xE",
        
      }
    }
  },
};
