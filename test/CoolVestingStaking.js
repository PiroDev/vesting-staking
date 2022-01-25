const { expect } = require('chai');

describe('CoolVestingStaking contract', () => {
    let RewardToken, rewardToken, deployer, owner, user1, user2;
    let initBalance, initStakeSize, rewardSize;
    let Vesting, vesting;
    let whitelisted;
    let staking, Staking;
    let cliffDurationDays, releaseDurationDays;
    const day = 24 * 3600;

    beforeEach(async () => {
        [deployer, owner, user1, user2, _] = await ethers.getSigners();
        RewardToken = await ethers.getContractFactory('CoolRewardToken');
        rewardToken = await RewardToken.deploy();

        initBalance = 100;
        await rewardToken.mint(user1.address, initBalance);
        await rewardToken.mint(user2.address, initBalance);

        Staking = await ethers.getContractFactory('CoolVestingStaking');
        staking = await Staking.deploy(owner.address, rewardToken.address);
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await staking.owner()).to.equal(owner.address);
        });

        it('Should set the right reward token', async () => {
            expect(await staking.rewardToken()).to.equal(rewardToken.address);
        });

        it('Should set state to "CREATED"', async () => {
            expect(await staking.state()).to.equal(0);
        });

        it('Should set total staked to 0', async () => {
            expect(await staking.totalStaked()).to.equal(0);
        });
    });

    describe('Initialization', () => {
        beforeEach(async () => {
            [owner, owner, user1, user2, _] = await ethers.getSigners();
            whitelisted = [user1.address, user2.address];
            Vesting = await ethers.getContractFactory('CoolLinearVestingStrategy');

            initStakeSize = 100;
            rewardSize = 300;
            const cliffDurationDays = 10;
            const releaseDurationDays = 30;
            vesting = await Vesting.deploy(cliffDurationDays, releaseDurationDays);

        });

        it('Should set right whitelisted users', async () => {
            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            for (let i = 0; i < whitelisted.length; i++) {
                expect(await staking.whitelisted(i)).to.equal(whitelisted[i]);
            }
        });

        it('Should set right initial stake size', async () => {
            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            for (let i = 0; i < whitelisted.length; i++) {
                const staker = await staking.stakers(whitelisted[i]);
                expect(staker['stakeSize']).to.equal(initStakeSize);
            }
        });

        it('Should set right reward size', async () => {
            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            expect(await staking.rewardSize()).to.equal(rewardSize);
        });

        it('Should set right vesting strategy', async () => {
            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            expect(await staking.vestingStrategy()).to.equal(vesting.address);
        });

        it('Should set state to "INITIALIZED"', async () => {
            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            expect(await staking.state()).to.equal(1);
        });

        it('Should revert if caller is not owner', async () => {
            expect(staking.connect(user1).initialize(whitelisted, initStakeSize, rewardSize, vesting.address)).to.be.reverted;
        });

        it('Should revert if state is not "CREATED"', async () => {
            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            expect(staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address)).to.be.reverted;
        });
    });

    describe('Staking', () => {
        beforeEach(async () => {
            whitelisted = [user1.address, user2.address];
            Vesting = await ethers.getContractFactory('CoolLinearVestingStrategy');

            initStakeSize = 100;
            rewardSize = 300;
            cliffDurationDays = 10;
            releaseDurationDays = 30;
            vesting = await Vesting.deploy(cliffDurationDays, releaseDurationDays);

            await staking.connect(owner).initialize(whitelisted, initStakeSize, rewardSize, vesting.address);

            await rewardToken.connect(user1).approve(staking.address, initStakeSize);
            await rewardToken.connect(user2).approve(staking.address, initStakeSize);
        });

        describe('Start staking', () => {
            it('Should transfer stakes from stakers to contract', async () => {
                await staking.connect(owner).start();

                expect(await staking.totalStaked()).to.equal(whitelisted.length * initStakeSize);
            });

            it('Should set state to "STARTED"', async () => {
                await staking.connect(owner).start();

                expect(await staking.state()).to.equal(2);
            });

            it('Should set right start time', async () => {
                await staking.connect(owner).start();

                const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
                expect(await staking.startTime()).to.equal(startTime);
            });

            it('Should revert if caller is not owner', async () => {
                await expect(staking.connect(user1).start()).to.be.reverted;
            });

            it('Should revert if state is not "INITIALIZED"', async () => {   
                await staking.connect(owner).start();

                expect(staking.connect(owner).start()).to.be.reverted;
            });
        });

        describe('Whitelist', () => {
            beforeEach(async () => {
                await staking.connect(owner).start();
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

        describe('Vesting strategy', () => {
            it('Should set right vesting strategy', async () => {
                newVesting = await Vesting.deploy(cliffDurationDays, releaseDurationDays);
                staking.connect(owner).setVestingStrategy(newVesting.address);

                expect(await staking.vestingStrategy()).to.equal(newVesting.address);
            });

            it('Should revert if new vesting strategy address is equal to old one', async () => {
                expect(staking.connect(owner).setVestingStrategy(vesting.address)).to.be.reverted;
            });

            it('Should revert if caller is not owner', async () => {
                await expect(staking.connect(user1).setVestingStrategy(vesting.address)).to.be.reverted;
            });
        });

        describe('Set reward size', () => {
            it('Should set right reward size', async () => {
                await staking.connect(owner).start();

                const newRewardSize = 400;
                await staking.connect(owner).setRewardSize(newRewardSize);

                expect(await staking.rewardSize()).to.equal(newRewardSize);
            });

            it('Should revert if caller is not owner', async () => {
                await staking.connect(owner).start();
                const newRewardSize = 400;

                await expect(staking.connect(user1).setRewardSize(newRewardSize)).to.be.reverted;
            });
        });

        describe('Claim rewards', () => {
            let daysStaked, timedeltaSeconds;

            it('Should transfer properly calculated reward to staker', async () => {
                await staking.connect(owner).start();

                daysStaked = 3;
                timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]); 
                await ethers.provider.send('evm_mine');

                await rewardToken.mint(staking.address, 25000);

                const balanceBefore = +(await rewardToken.balanceOf(user1.address));
                const staker = await staking.stakers(user1.address);
                const stakeSize = staker['stakeSize'];

                const expectedReward = await staking.calcRewards(stakeSize, timedeltaSeconds);

                await staking.connect(user1).claimRewards();
                const balanceGot = await rewardToken.balanceOf(user1.address);

                expect(+balanceGot).to.equal(+expectedReward + balanceBefore);
            });

            it('Should revert if rewards pool is not sufficient', async () => {
                await staking.connect(owner).start();

                daysStaked = 3;
                timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]); 
                await ethers.provider.send('evm_mine');

                expect(staking.connect(user1).claimRewards()).to.be.reverted;
            });

            it('Should revert if address not in whitelist', async () => {
                await staking.connect(owner).start();

                expect(staking.connect(deployer).claimRewards()).to.be.reverted;
            });

            it('Should revert if state is not "STARTED"', async () => {
                expect(staking.connect(user1).claimRewards()).to.be.reverted;
            });
        });

        describe('Calculate rewards', () => {
            it('Should calculate rewards properly', async () => {
                await staking.connect(owner).start();

                const daysStaked = 5;
                const stakeSize = 200;
                const totalStaked = await staking.totalStaked();
                const expectedReward = daysStaked * rewardSize * stakeSize / +totalStaked;

                expect(+(await staking.calcRewards(stakeSize, daysStaked * day))).to.equal(expectedReward);
            });

            it('Should revert if no tokens staked', async () => {
                const timedeltaSeconds = 4 * day;
                const stakeSize = 200;
                expect(staking.calcRewards(stakeSize, timedeltaSeconds)).to.be.reverted;
            });

            it('Should revert if state is not "STARTED"', async () => {
                const timedeltaSeconds = 4 * day;
                const stakeSize = 200;
                expect(staking.calcRewards(stakeSize, timedeltaSeconds)).to.be.reverted;
            });
        });

        describe('Calculate annual percent yield (APY)', () => {
            it('Should calculate APY properly', async () => {
                staking.connect(owner).start();

                const totalStaked = await staking.totalStaked();
                const expectedAPY = rewardSize * 365 * 100 / +totalStaked;

                expect(await staking.calcAnnualPercentYield()).to.equal(expectedAPY);
            });

            it('Should revert if state is not "STARTED"', async () => {
                expect(staking.calcAnnualPercentYield()).to.be.reverted;
            });
        });

        describe('Get rewards pool size', async () => {
            it('Should return right rewards pool size', async () => {
                await staking.connect(owner).start();
                const rewardsPoolSize = 25000;
                await rewardToken.mint(staking.address, rewardsPoolSize);

                expect(await staking.rewardsPool()).to.equal(rewardsPoolSize);
            });
        });

        describe('Get allowance that could be claimed', () => {
            it('Should calculate how much to claim is left per vesting schedule', async () => {
                await staking.connect(owner).start();
                const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

                daysStaked = cliffDurationDays + 5;
                timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
                await ethers.provider.send('evm_mine');

                const totalStaked = await staking.totalStaked();
                const expectedVestedAmount = await vesting.calcVestedAmount(startTime, totalStaked);

                expect(await staking.allowanceThatCouldBeClaimed()).to.equal(expectedVestedAmount);
            });

            it('Should revert if state is not "STARTED"', async () => {
                expect(staking.allowanceThatCouldBeClaimed()).to.be.reverted;
            });
        });

        describe('Unstake', () => {
            it('Should transfer requested stake size to staker', async () => {
                await staking.connect(owner).start();
                daysStaked = cliffDurationDays + releaseDurationDays;
                timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
                await ethers.provider.send('evm_mine');

                const expectedStakeLeft = 0;
                const totalStakedBefore = await staking.totalStaked();
                const expectedTotalStakedAfter = totalStakedBefore - initStakeSize;

                const stakerBalanceBefore = await rewardToken.balanceOf(user1.address);
                const expectedStakerBalanceAfter = stakerBalanceBefore + initStakeSize;

                await staking.connect(user1).unstake(initStakeSize);

                const staker = await staking.stakers(user1.address);
                expect(+staker['stakeSize']).to.equal(expectedStakeLeft);
                expect(await staking.totalStaked()).to.equal(expectedTotalStakedAfter);
                expect(await rewardToken.balanceOf(user1.address)).to.equal(expectedStakerBalanceAfter);
            });

            it('Should revert if stake size is less than requested amount', async () => {
                await staking.connect(owner).start();
                daysStaked = cliffDurationDays + releaseDurationDays;
                timedeltaSeconds = daysStaked * day;
                await ethers.provider.send('evm_increaseTime', [timedeltaSeconds]);
                await ethers.provider.send('evm_mine');

                expect(staking.connect(user1).unstake(initStakeSize * 2)).to.be.reverted;
            });

            it('Should revert if such amount of tokens are not allowed to unstake yet due to the vesting schedule', async () => {
                await staking.connect(owner).start();

                expect(staking.connect(user1).unstake(initStakeSize)).to.be.reverted;
            });

            it('Should revert if caller not in whitelist', async () => {
                await staking.connect(owner).start();

                expect(staking.connect(deployer).unstake(initStakeSize)).to.be.reverted;
            });

            it('Should revert if state is not "STARTED"', async () => {
                expect(staking.connect(user1).unstake(initStakeSize)).to.be.reverted;
            });
        });
    });
});
