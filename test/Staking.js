const { expect } = require('chai');
const { Wallet, BigNumber} = require('ethers');
const { ethers } = require('hardhat');

describe('Staking contract', () => {
    const VestingId = {EMPTY: 0, DAYS_30: 1, DAYS_60: 2};

    let RewardToken, rewardToken, deployer, owner, user1, user2, user3;
    let initUserBalance, initOwnerBalance, rewardsPerDay1, rewardsPerDay2;
    let rewardsPoolSize;
    let Vesting, vesting30days, vesting60days;
    let users;
    let staking, Staking;
    let cliffDurationDays, releaseDurationDays1, releaseDurationDays2;
    const day = 24 * 3600;

    beforeEach(async () => {
        [deployer, owner, user1, user2, user3, _] = await ethers.getSigners();
        RewardToken = await ethers.getContractFactory('RewardToken');
        rewardToken = await RewardToken.deploy();

        initUserBalance = 100;
        initOwnerBalance = 1e10;
        rewardsPoolSize = 200000;

        await rewardToken.mint(owner.address, initOwnerBalance);
        await rewardToken.mint(user1.address, initUserBalance);
        await rewardToken.mint(user2.address, initUserBalance);

        Staking = await ethers.getContractFactory('Staking');
        staking = await Staking.deploy(owner.address, rewardToken.address);
        await rewardToken.connect(owner).approve(staking.address, initOwnerBalance);

        Vesting = await ethers.getContractFactory('LinearVesting');
        cliffDurationDays = 10;
        releaseDurationDays1 = 20;
        releaseDurationDays2 = 50;
        vesting30days = await Vesting.deploy(cliffDurationDays, releaseDurationDays1);
        vesting60days = await Vesting.deploy(cliffDurationDays, releaseDurationDays2);
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await staking.owner()).to.equal(owner.address);
        });

        it('Should set the right reward token', async () => {
            expect(await staking.rewardToken()).to.equal(rewardToken.address);
        });

        it('Should set isStarted to false', async () => {
            expect(await staking.isStarted()).to.be.false;
        });
    });

    describe('Initialization', () => {
        beforeEach(async () => {
            users = [
                { addr: user1.address, stakeSize: 20, vesting: VestingId.DAYS_30 },
                { addr: user2.address, stakeSize: 50, vesting: VestingId.DAYS_60 }
            ];

            rewardsPerDay1 = 100;
            rewardsPerDay2 = 150;
        });

        describe('Vesting strategies', () => {
            it('Should set right vesting strategies', async () => {
                await staking.connect(owner).initializeVesting(VestingId.DAYS_30, vesting30days.address, rewardsPerDay1);
                await staking.connect(owner).initializeVesting(VestingId.DAYS_60, vesting60days.address, rewardsPerDay2);

                const vesting1 = await staking.vestings(VestingId.DAYS_30);
                const vesting2 = await staking.vestings(VestingId.DAYS_60);

                expect(vesting1.strategy).to.equal(vesting30days.address);
                expect(vesting1.rewardsPerDay).to.equal(rewardsPerDay1);

                expect(vesting2.strategy).to.equal(vesting60days.address);
                expect(vesting2.rewardsPerDay).to.equal(rewardsPerDay2);
            });

            it('Should revert if caller is not owner', async () => {
                expect(staking.connect(user1).initializeVesting(VestingId.DAYS_30, vesting30days.address, rewardsPerDay1)).to.be.reverted;
            });

            it('Should revert if staking already started', async () => {
                await staking.connect(owner).initializeVesting(VestingId.DAYS_30, vesting30days.address, rewardsPerDay1);
                await staking.connect(owner).initializeVesting(VestingId.DAYS_60, vesting60days.address, rewardsPerDay2);
                await staking.connect(owner).initializeUsers(users);
                await staking.connect(owner).start(rewardsPoolSize);

                expect(staking.connect(owner).initializeVesting(VestingId.DAYS_30, vesting30days.address, rewardsPerDay1)).to.be.reverted;
            });
        });

        describe('Users', () => {
            it('Should set right whitelisted users', async () => {
                await staking.connect(owner).initializeUsers(users);
    
                for (let i = 0; i < users.length; i++) {
                    expect(await staking.isWhitelisted(users[i].addr)).to.be.true;
                }
            });
    
            it('Should set right stake size', async () => {
                await staking.connect(owner).initializeUsers(users);
    
                for (let i = 0; i < users.length; i++) {
                    const staker = await staking.stakers(users[i].addr);
                    expect(staker['stake']['currentSize']).to.equal(users[i].stakeSize);
                }
            });

            it('Should set right vesting strategy for users', async () => {
                await staking.connect(owner).initializeUsers(users);

                for (let i = 0; i < users.length; i++) {
                    const staker = await staking.stakers(users[i].addr);
                    expect(staker['vesting']).to.equal(users[i].vesting);
                }
            });
            
            it('Should transfer stake size for all initialized users from owner to contract', async () => {
                const totalStakedBefore = 0;
                let expectedTotalStakedAfter = 0;
                await staking.connect(owner).initializeUsers(users);

                for (let i = 0; i < users.length; i++) {
                    expectedTotalStakedAfter += users[i].stakeSize;
                }

                const days30Staked = +(await staking.totalStaked(VestingId.DAYS_30));
                const days60Staked = +(await staking.totalStaked(VestingId.DAYS_60));

                expect(days30Staked + days60Staked).to.equal(expectedTotalStakedAfter);
            });

            it('Should revert if caller is not owner', async () => {
                expect(staking.connect(user1).initializeUsers(users)).to.be.reverted;
            });

            it('Should revert if staking already started', async () => {
                await staking.connect(owner).initializeVesting(VestingId.DAYS_30, vesting30days.address, rewardsPerDay1);
                await staking.connect(owner).initializeVesting(VestingId.DAYS_60, vesting60days.address, rewardsPerDay2);
                await staking.connect(owner).initializeUsers(users);
                await staking.connect(owner).start(rewardsPoolSize);

                expect(staking.connect(owner).initializeUsers(users)).to.be.reverted;
            });

            it('Should revert if length of array of users more than 20', async () => {
                users = [];
                for (let i = 0; i < 21; i++) {
                    users.push({ addr: Wallet.createRandom().address, stake: { size: 20, vesting: VestingId.DAYS_30 } });
                }

                expect(staking.connect(owner).initializeUsers(users)).to.be.reverted;
            });
        });
    });

    describe('Staking', () => {
        beforeEach(async () => {
            users = [
                { addr: user1.address, stakeSize: 20, vesting: VestingId.DAYS_30 },
                { addr: user2.address, stakeSize: 50, vesting: VestingId.DAYS_60 },
                { addr: user3.address, stakeSize: 80, vesting: VestingId.DAYS_60 }
            ];

            rewardsPerDay1 = 100;
            rewardsPerDay2 = 150;

            await staking.connect(owner).initializeVesting(VestingId.DAYS_30, vesting30days.address, rewardsPerDay1);
            await staking.connect(owner).initializeVesting(VestingId.DAYS_60, vesting60days.address, rewardsPerDay2);
            await staking.connect(owner).initializeUsers(users);
        });

        describe('Start staking', () => {
            it('Should transfer initial supply for rewards pool from owner to contract', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                expect(await staking.rewardsPool()).to.equal(rewardsPoolSize);
            });

            it('Should set isStarted to true', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                expect(await staking.isStarted()).to.be.true;
            });

            it('Should set right start time', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
                expect(await staking.startTime()).to.equal(startTime);
            });

            it('Should set right lastUpdateTime', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

                const vesting1 = await staking.vestings(VestingId.DAYS_30);
                const vesting2 = await staking.vestings(VestingId.DAYS_60);

                expect(+vesting1['lastUpdateTime']).to.equal(startTime);
                expect(+vesting2['lastUpdateTime']).to.equal(startTime);
            });

            it('Should revert if caller is not owner', async () => {
                expect(staking.connect(user1).start(rewardsPoolSize)).to.be.reverted;
            });

            it('Should revert if staking already started', async () => {   
                await staking.connect(owner).start(rewardsPoolSize);

                expect(staking.connect(owner).start(rewardsPoolSize)).to.be.reverted;
            });

            it('Should revert if staking is not initialized properly', async () => {
                const zeroAddress = '0x'+'0'.repeat(40);

                await staking.connect(owner).initializeVesting(VestingId.DAYS_30, zeroAddress, rewardsPerDay1);
                await staking.connect(owner).initializeVesting(VestingId.DAYS_60, zeroAddress, rewardsPerDay2);

                expect(staking.connect(owner).start(rewardsPoolSize)).to.be.reverted;
            });
        });

        describe('Whitelist', () => {
            beforeEach(async () => {
                await staking.connect(owner).start(rewardsPoolSize);
            });

            describe('Add to whitelist', () => {
                it('Should add address to whitelist', async () => {
                    await staking.connect(owner).addToWhitelist(owner.address);

                    expect(await staking.isWhitelisted(owner.address)).to.be.true;
                });

                it('Should revert if address is already in whitelist', async () => {
                    expect(staking.connect(owner).addToWhitelist(user1.address)).to.be.reverted;
                });

                it('Should revert if caller is not owner', async () => {
                    await expect(staking.connect(user1).addToWhitelist(owner)).to.be.reverted;
                });
            });

            describe('Remove from whitelist', async () => {
                it('Should remove address from whitelist', async () => {
                    await staking.connect(owner).removeFromWhitelist(user1.address);

                    expect(await staking.isWhitelisted(user1.address)).to.be.false;
                });

                it('Should revert if address is not in whitelist', async () => {
                    expect(staking.connect(owner).removeFromWhitelist(owner.address)).to.be.reverted;
                });

                it('Should revert if caller is not owner', async () => {
                    await expect(staking.connect(user1).removeFromWhitelist(user1)).to.be.reverted;
                });
            });
        });

        describe('Stake', () => {
            const stakeSize = 300;
            beforeEach(async () => {
                await staking.connect(owner).addToWhitelist(owner.address);
            });

            it('Should transfer stake from user to contract', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                const totalStakedBefore = await staking.totalStaked(VestingId.DAYS_60);

                await staking.connect(owner).stake(VestingId.DAYS_60, stakeSize);
                expect(await staking.totalStaked(VestingId.DAYS_60)).to.equal(+totalStakedBefore + stakeSize);
            });

            it('Should set right stake size for staker', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                await staking.connect(owner).stake(VestingId.DAYS_60, stakeSize);
                const staker = await staking.stakers(owner.address);
                expect(staker.stake.currentSize).to.equal(stakeSize);
            });

            it('Should set right vesting strategy for staker', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                await staking.connect(owner).stake(VestingId.DAYS_60, stakeSize);
                const staker = await staking.stakers(owner.address);
                expect(staker.vesting).to.equal(VestingId.DAYS_60);
            });

            it('Should set right lastUpdateTime', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                await staking.connect(owner).stake(VestingId.DAYS_60, stakeSize);

                const vesting2 = await staking.vestings(VestingId.DAYS_60);

                const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
                expect(vesting2.lastUpdateTime).to.equal(startTime);
            });

            it('Should revert if caller not in whitelist', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                expect(staking.connect(deployer).stake(VestingId.DAYS_60, stakeSize)).to.be.reverted;
            });

            it('Should revert if vesting id is "EMPTY"', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                expect(staking.connect(owner).stake(stakeSize, 0)).to.be.reverted;
            });
        });

        describe('Unstake', () => {
            it('Should transfer requested stake size to staker', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                const daysStaked = cliffDurationDays + releaseDurationDays1;
                const timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
                await ethers.provider.send('evm_mine');

                const vestingId = users[0].vesting;
                const expectedStakeLeft = 0;
                const totalStakedBefore = await staking.totalStaked(vestingId);
                let staker = await staking.stakers(user1.address);
                const stakeSizeBefore = staker['stake']['currentSize'];
                const expectedTotalStakedAfter = totalStakedBefore - stakeSizeBefore;

                const stakerBalanceBefore = await rewardToken.balanceOf(user1.address);
                const expectedStakerBalanceAfter = +stakerBalanceBefore + +stakeSizeBefore;

                await staking.connect(user1).unstake(stakeSizeBefore);

                staker = await staking.stakers(user1.address);
                expect(staker['stake']['currentSize']).to.equal(expectedStakeLeft);
                expect(await staking.totalStaked(vestingId)).to.equal(expectedTotalStakedAfter);
                expect(await rewardToken.balanceOf(user1.address)).to.equal(expectedStakerBalanceAfter);
            });

            it('Should revert if stake size is less than requested amount', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                let staker = await staking.stakers(user1.address);
                const stakeSize = staker['stake']['currentSize'];

                const daysStaked = cliffDurationDays + releaseDurationDays1;
                const timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
                await ethers.provider.send('evm_mine');

                expect(staking.connect(user1).unstake(rewardsPoolSize)).to.be.reverted;
            });

            it('Should revert if such amount of tokens are not allowed to unstake yet due to the vesting schedule', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                let staker = await staking.stakers(user1.address);
                const stakeSize = staker['stake']['currentSize'];
                expect(staking.connect(user1).unstake(stakeSize)).to.be.reverted;
            });

            it('Should revert if caller not in whitelist', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                const stakeSize = 100;

                expect(staking.connect(deployer).unstake(stakeSize)).to.be.reverted;
            });

            it('Should revert if user is not staking', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                await staking.connect(owner).addToWhitelist(owner.address);

                const stakeSize = 100;

                expect(staking.connect(owner).unstake(stakeSize)).to.be.reverted;
            });
        });

        describe('Claim rewards', () => {
            let daysStaked, timedeltaSeconds;

            it('Should transfer properly calculated reward to staker', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                const daysStaked = 3;
                const timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]); 
                await ethers.provider.send('evm_mine');

                const vestingId = users[0].vesting;

                const balanceBefore = +(await rewardToken.balanceOf(user1.address));
                const staker = await staking.stakers(user1.address);
                const stakeSize = +staker['stake']['currentSize'];
                const totalStaked = +(await staking.totalStaked(vestingId));

                const expectedReward = Math.floor(stakeSize / totalStaked * rewardsPerDay1 * timedeltaSeconds / day);

                await staking.connect(user1).claimRewards();
                const balanceGot = await rewardToken.balanceOf(user1.address);

                expect(+balanceGot).to.equal(+expectedReward + balanceBefore);
            });

            it('Should revert if rewards pool is not sufficient', async () => {
                await staking.connect(owner).start(1);

                const daysStaked = 3;
                const timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]); 
                await ethers.provider.send('evm_mine');

                expect(staking.connect(user1).claimRewards()).to.be.reverted;
            });

            it('Should revert if address not in whitelist', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                expect(staking.connect(deployer).claimRewards()).to.be.reverted;
            });
        });

        describe('Calculate annual percent yield (APY)', () => {
            it('Should calculate APY properly for actual staker', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                const totalStaked = await staking.totalStaked(users[0].vesting);
                const expectedAPY = Math.floor(rewardsPerDay1 * 365 * 100 / +totalStaked);

                expect(await staking.connect(user1)['calcAPY()']()).to.equal(expectedAPY);
            });

            it('Should calculate APY properly for potential staker', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                const stakeSize = 100;

                const totalStaked = await staking.totalStaked(VestingId.DAYS_30);
                const expectedAPY = Math.floor(rewardsPerDay1 * 365 * 100 / (+totalStaked + stakeSize));

                expect(await staking['calcAPY(uint8,uint256)'](VestingId.DAYS_30, stakeSize)).to.equal(expectedAPY);
            });
        });

        describe('Get rewards pool size', async () => {
            it('Should return right rewards pool size', async () => {
                await staking.connect(owner).start(rewardsPoolSize);

                expect(await staking.rewardsPool()).to.equal(rewardsPoolSize);
            });
        });

        describe('Get allowance that could be claimed', () => {
            it('Should calculate how much to claim is left per vesting schedule', async () => {
                await staking.connect(owner).start(rewardsPoolSize);
                const staker = await staking.stakers(user1.address);
                const startTime = staker.stake.startTime;

                const daysStaked = cliffDurationDays + 5;
                const timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
                await ethers.provider.send('evm_mine');

                const totalStaked = await staking.totalStaked(VestingId.DAYS_30);
                const expectedVestedAmount = await vesting30days.calcVestedAmount(startTime, totalStaked);

                expect(await staking.connect(user1).howMuchToClaimIsLeft()).to.equal(expectedVestedAmount);
            });

            it('Should revert if staking is not started', async () => {
                await expect(staking.connect(user1).howMuchToClaimIsLeft()).to.be.reverted;
            });
        });
    });

    describe('Get full amount of tokens', () => {
        it('Should return total supply of ERC20 rewards token', async () => {
            const tokensActual = await rewardToken.totalSupply();

            expect(await staking.fullAmountOfTokens()).to.equal(tokensActual);
        });
    });

    describe('Increase rewards pool', () => {
        it('Should increase rewards pool', async () => {
            const amount = 1000;
            const rewardsPoolBefore = +(await staking.rewardsPool());

            await staking.connect(owner).increaseRewardsPool(amount);
            const expectedRewardsPoolAfter = rewardsPoolBefore + amount;
            
            expect(await staking.rewardsPool()).to.equal(expectedRewardsPoolAfter);
        });

        it('Should revert if caller is not owner', async () => {
            expect(staking.connect(user1).increaseRewardsPool(1000)).to.be.reverted;
        });
    });
});
