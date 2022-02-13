require("@nomiclabs/hardhat-waffle");

require('solidity-coverage');
require('hardhat-contract-sizer');
require('./tasks/magic.js');
const {secret} = require('./secret.js');

module.exports = {
  solidity: "0.8.4",
  networks: {
    'local': {
      'url': 'http://127.0.0.1:8545',
      'accounts': [secret]
    }
  }
};
