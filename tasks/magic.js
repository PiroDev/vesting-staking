const {task} = require('hardhat/config.js');

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

    console.log('Deploying Staking...');
    const staking = await Staking.deploy(deployer.address, rewardToken.address);
    console.log(`Staking address: ${staking.address}`);

    return {deployer, rewardToken, vesting30Days, vesting60Days, staking};
}

const fs = require('fs');

const exportContractsInfo = info => {
    const data = JSON.stringify(info, null, 4);
    fs.writeFileSync('artifacts/contracts/info.json', data, (err) => {
        if (err) {throw err;}
    });
};

task('magic', 'Compiles, deploys, exports abi\'s and addresses, initializes and deploys all contracts')
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
        exportContractsInfo(info);
        console.log('Initializing vesting 1...');
        await staking.initializeVesting(1, vesting30Days.address, 1000);
        console.log('Done');

        console.log('Initializing vesting 2...');
        await staking.initializeVesting(2, vesting60Days.address, 1250);
        console.log('Done');

        const mintAmount = 10000;
        console.log(`Minting ${mintAmount} tokens...`);
        await rewardToken.mint(deployer.address, mintAmount);
        console.log('Done');

        console.log('Approving tokens transfer...');
        await rewardToken.approve(staking.address, mintAmount);
        console.log('Done');

        console.log('Starting staking...');
        await staking.start(mintAmount);
        console.log('Done');
    });