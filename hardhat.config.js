require("@nomiclabs/hardhat-waffle");

require('solidity-coverage');
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('./tasks/deploy-and-init.js');
require('./tasks/time.js');
require('@nomiclabs/hardhat-etherscan');

const {secret} = require('./secret.js');

module.exports = {
    solidity: "0.8.4",
    networks: {
        'local': {
            'url': 'http://127.0.0.1:8545',
            'accounts': [secret]
        },
        'ropsten': {
            'url': 'https://ropsten.infura.io/v3/e5bc8d39e7f14ab29c3af815011e15a1',
            'accounts': [secret]
        }
    },
    etherscan: {
        apiKey: {
            'ropsten': "https://api-ropsten.etherscan.io"
        }
    }
};
