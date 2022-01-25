const {expect} = require('chai');

const {ethers} = require('hardhat');

describe('CoolLinearVestingStrategy contract', () => {
    let Vesting, vesting, user, cliffDurationDays, releaseDurationDays;
    const day = 24 * 3600;

    beforeEach(async () => {
        [user, _] = await ethers.getSigners();

        cliffDurationDays = 10;
        releaseDurationDays = 30;

        Vesting = await ethers.getContractFactory('CoolLinearVestingStrategy');
        vesting = await Vesting.deploy(cliffDurationDays, releaseDurationDays);
    });

    describe('Deployment', () => {
        it('Should set right cliff duration', async () => {
            expect(await vesting.cliffDuration()).to.equal(cliffDurationDays * day);
        });

        it('Should set right release duration', async () => {
            expect(await vesting.releaseDuration()).to.equal(releaseDurationDays * day);
        });
    });

    describe('Calculate vested amount', () => {
        const allowance = 1000;
        const daysSinceCliffEnding = 4;

        it('Should calculate right vested amount during cliff', async () => {
            const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
            expect(await vesting.calcVestedAmount(startTime, allowance)).to.equal(0);
        });

        it('Should calculate right vested amount during release', async () => {
            const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
            await ethers.provider.send('evm_increaseTime', [(cliffDurationDays + daysSinceCliffEnding) * day]);
            await ethers.provider.send('evm_mine');

            expect(await vesting.calcVestedAmount(startTime, allowance)).to.equal(Math.round(daysSinceCliffEnding * allowance / releaseDurationDays));
        });

        it('Should calculate right vested amount after release', async () => {
            const startTime = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
            await ethers.provider.send('evm_increaseTime', [(cliffDurationDays + releaseDurationDays + 1) * day]);
            await ethers.provider.send('evm_mine');

            expect(await vesting.calcVestedAmount(startTime, allowance)).to.equal(allowance);
        });
    });
});