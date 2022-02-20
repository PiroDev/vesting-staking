const {task} = require('hardhat/config.js');
const {utils} = require('ethers');
const fs = require('fs');
const {BigNumber} = require("ethers");

const numstrToBN = (input, dec = 18) => {
    if (!input) return BigNumber.from(0);
    const spl = input.split(".");
    if (spl[1]?.length > dec) {
        input = [spl[0], spl[1].slice(0, dec)].join(".");
    }
    return utils.parseUnits(input, dec);
}

const deployAll = async ethers => {
    const [deployer] = await ethers.getSigners();

    const RewardToken = await ethers.getContractFactory('RewardToken');
    const Vesting = await ethers.getContractFactory('LinearVesting');
    const Staking = await ethers.getContractFactory('Staking');

    console.log('Deploying RewardToken...');
    const rewardToken = await RewardToken.deploy();
    console.log(`RewardToken address: ${rewardToken.address}`);

    console.log('Deploying 30 days Vesting...');
    const vesting30Days = await Vesting.deploy(10, 20);
    console.log(`30 days vesting address: ${vesting30Days.address}`);

    console.log('Deploying 60 days Vesting...');
    const vesting60Days = await Vesting.deploy(20, 40);
    console.log(`60 days vesting address: ${vesting60Days.address}`);

    console.log('Waiting for tx to be mined...');
    await rewardToken.deployed();
    await vesting60Days.deployed();
    await vesting30Days.deployed();
    console.log('Done');

    console.log('Deploying Staking...');
    const staking = await Staking.deploy(deployer.address, rewardToken.address);
    await staking.deployed();
    console.log(`Staking address: ${staking.address}`);

    return {deployer, rewardToken, vesting30Days, vesting60Days, staking};
}

const exportContractsInfo = info => {
    const data = JSON.stringify(info, null, 4);
    fs.writeFileSync('artifacts/contracts/info.json', data, (err) => {
        if (err) {throw err;}
    });
};

task('deploy-and-init', 'Compiles, deploys, exports abi\'s and addresses, initializes and deploys all contracts')
    .setAction(async (args, hre) => {
        await hre.run('compile');
        const {deployer, rewardToken, staking, vesting30Days, vesting60Days} = await deployAll(hre.ethers);

        const network = hre.network.config;
        const info = {
            contractAddresses: {
                rewardToken: rewardToken.address,
                staking: staking.address,
                vesting30Days: vesting30Days.address,
                vesting60Days: vesting60Days.address
            },
            provider: {
                url: network.url,
                chainId: network.chainId
            }
        };

        const rewardsPerDay1 = numstrToBN('1000');
        const rewardsPerDay2 = numstrToBN('1250');

        exportContractsInfo(info);
        console.log('Initializing vesting 1...');
        let tx = await staking.initializeVesting(1, vesting30Days.address, rewardsPerDay1);
        await tx.wait();
        console.log('Done');

        console.log('Initializing vesting 2...');
        tx = await staking.initializeVesting(2, vesting60Days.address, rewardsPerDay2);
        await tx.wait();
        console.log('Done');

        const mintAmount = numstrToBN('50125.254');
        console.log(`Minting ${mintAmount} tokens...`);
        tx = await rewardToken.mint(deployer.address, mintAmount);
        await tx.wait();
        console.log('Done');

        const initRewards = numstrToBN('40000');

        console.log('Approving tokens transfer...');
        tx = await rewardToken.approve(staking.address, initRewards);
        await tx.wait();
        console.log('Done');

        console.log('Starting staking...');
        tx = await staking.start(initRewards);
        await tx.wait();
        console.log('Done');

        console.log('Adding owner to whitelist...');
        tx = await staking.addToWhitelist(deployer.address);
        await tx.wait();
        console.log('Done');

        /* For local testing */
        /*
        console.log('Disabling automining...');
        await hre.ethers.provider.send("evm_setAutomine", [false]);
        await hre.ethers.provider.send("evm_setIntervalMining", [3000]);
        */
    });

module.exports = {};