const { expect } = require('chai');

describe('CoolRewardToken contract', () => {
    let Token, token, owner, user1, user2;

    beforeEach(async () => {
        [owner, user1, user2, _] = await ethers.getSigners();
        Token = await ethers.getContractFactory('CoolRewardToken');
        token = await Token.deploy();
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await token.owner()).to.equal(owner.address);
        });
    });

    describe('Mint', () => {
        it('Should mint tokens if caller is owner', async () => {
            const mintAmount = 100;

            await token.connect(owner).mint(user2.address, mintAmount);
            expect(await token.balanceOf(user2.address)).to.equal(mintAmount);
        });

        it('Should revert if caller is not owner', async () => {
            const mintAmount = 100;

            await expect(token.connect(user1).mint(user2.address, mintAmount)).to.be.reverted;
        });
    });
});