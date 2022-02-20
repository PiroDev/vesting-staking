require("@nomiclabs/hardhat-waffle");

require('solidity-coverage');
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('./tasks/deploy-and-init.js');
require('./tasks/time.js');
require('@nomiclabs/hardhat-etherscan');

const {signers, apiKeys, providers} = require('./secret.js');

module.exports = {
    solidity: "0.8.4",
    networks: {
        'local': {
            'url': providers.local,
            'accounts': signers.local
        },
        'ropsten': {
            'url': providers.ropsten,
            'accounts': signers.ropsten
        }
    },
    etherscan: {
        apiKey: {
            'ropsten': apiKeys.ropsten
        }
    }
};
