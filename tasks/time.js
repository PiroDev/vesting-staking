const {task} = require('hardhat/config.js');

task('time', 'Increase time 15 days')
    .setAction(async (args, hre) => {
        const day = 24 * 3600;
        const timedeltaSeconds = 15 * day;

        await hre.ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
        await hre.ethers.provider.send('evm_mine');
    });

module.exports = {};