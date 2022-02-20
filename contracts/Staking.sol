pragma solidity ^0.8.0;

// SPDX-License-Identifier: Unlicensed

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './IVesting.sol';

contract Staking is Ownable {
    using SafeMath for uint256;

    enum VestingId { EMPTY, DAYS_30, DAYS_60 }

    struct Stake {
        uint initialSize;
        uint currentSize;
        uint startTime;
    }

    struct Staker {
        Stake stake;
        VestingId vesting;
        uint rewardsPerToken;
        uint unclaimedRewards;
    }

    struct Vesting {
        IVesting strategy;
        uint rewardsPerDay;
        uint lastUpdateTime;
        uint rewardsPerToken;
    }

    struct NewUser {
        address addr;
        uint stakeSize;
        VestingId vesting;
    }

    IERC20 public rewardToken;
    mapping(VestingId => Vesting) public vestings;
    mapping(VestingId => uint) public totalStaked;

    address[] public whitelisted;
    mapping(address => bool) public isWhitelisted;
    mapping(address => Staker) public stakers;
    mapping(address => uint) public claimedRewards;

    uint public rewardsPool;
    bool public isStarted;
    uint public startTime;

    constructor(address _owner, IERC20 _rewardToken) {
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }

        rewardToken = _rewardToken;
    }

    function initializeVesting(VestingId vestingId, IVesting vestingContract, uint rewardsPerDay) external onlyOwner notStarted {
        require(vestingId != VestingId.EMPTY, 'Wrong vesting');

        Vesting storage vesting = vestings[vestingId];
        vesting.rewardsPerDay = rewardsPerDay;
        vesting.strategy = vestingContract;
    }

    function initializeUsers(NewUser[] calldata users) external onlyOwner notStarted {
        require(users.length <= 20, 'Array of new users is too big');

        for (uint i = 0; i < users.length; i++) {
            NewUser calldata user = users[i];

            addToWhitelist(user.addr);
            Staker storage staker = stakers[user.addr];
            staker.stake.initialSize = user.stakeSize;
            staker.stake.currentSize = user.stakeSize;
            staker.vesting = user.vesting;
            rewardToken.transferFrom(msg.sender, address(this), user.stakeSize);

            totalStaked[user.vesting] = totalStaked[user.vesting].add(user.stakeSize);
        }
    }

    function addToWhitelist(address addr) public onlyOwner {
        require(isWhitelisted[addr] == false, 'Address is already in whitelist');

        whitelisted.push(addr);
        isWhitelisted[addr] = true;
    }

    function removeFromWhitelist(address addr) external onlyOwner {
        require(isWhitelisted[addr], 'Address must be whitelisted');
        isWhitelisted[addr] = false;

        for (uint i = 0; i < whitelisted.length; i++) {
            Staker storage staker = stakers[addr];
            if (whitelisted[i] == addr && staker.vesting != VestingId.EMPTY) {
                totalStaked[staker.vesting] = totalStaked[staker.vesting].sub(staker.stake.currentSize);

                whitelisted[i] = whitelisted[whitelisted.length - 1];
                whitelisted.pop();
                break;
            }
        }
    }

    modifier onlyWhitelisted {
        require(isWhitelisted[msg.sender]);
        _;
    }

    function start(uint initRewardsPool) external onlyOwner notStarted initialized {
        rewardToken.transferFrom(msg.sender, address(this), initRewardsPool);
        rewardsPool = initRewardsPool;

        startTime = block.timestamp;
        vestings[VestingId.DAYS_30].lastUpdateTime = block.timestamp;
        vestings[VestingId.DAYS_60].lastUpdateTime = block.timestamp;

        isStarted = true;
    }

    function stake(VestingId vesting, uint amount) external onlyWhitelisted newUser started {
        require(vesting != VestingId.EMPTY, 'Wrong vesting');

        Staker storage staker = stakers[msg.sender];
        rewardToken.transferFrom(msg.sender, address(this), amount);

        _updateRewardsPerToken(vesting);
        totalStaked[vesting] = totalStaked[vesting].add(amount);

        staker.rewardsPerToken = vestings[vesting].rewardsPerToken;
        staker.stake.initialSize = amount;
        staker.stake.currentSize = amount;
        staker.stake.startTime = block.timestamp;

        staker.vesting = vesting;
    }

    function unstake(uint amount) external userIsStaking started {
        Staker storage staker = stakers[msg.sender];

        if (staker.stake.startTime == 0) {
            staker.stake.startTime = startTime;
        }

        require(staker.stake.currentSize >= amount, 'Balance is not sufficient');

        Vesting storage vesting = vestings[staker.vesting];

        uint stakerAllowedToUnstake = _howMuchToClaimIsLeft(msg.sender);
        require(stakerAllowedToUnstake >= amount, 'Such amount of tokens are not vested yet');

        _updateRewards(msg.sender);
        totalStaked[staker.vesting] = totalStaked[staker.vesting].sub(amount);

        rewardToken.transfer(msg.sender, amount);
        staker.stake.currentSize = staker.stake.currentSize.sub(amount);        
        staker.rewardsPerToken = vesting.rewardsPerToken;
    }

    function claimRewards() public onlyWhitelisted started {
        _updateRewards(msg.sender);
        Staker storage staker = stakers[msg.sender];

        if (staker.unclaimedRewards > 0) {
            require(rewardsPool >= staker.unclaimedRewards, 'Reward pool must be sufficient');

            rewardToken.transfer(msg.sender, staker.unclaimedRewards);
            rewardsPool = rewardsPool.sub(staker.unclaimedRewards);
            claimedRewards[msg.sender] = claimedRewards[msg.sender].add(staker.unclaimedRewards);

            staker.unclaimedRewards = 0;
        }
    }

    function calcAPY() external view started userIsStaking returns(uint) {
        VestingId vesting = stakers[msg.sender].vesting;

        return vestings[vesting].rewardsPerDay.mul(365).mul(100).div(totalStaked[vesting]);
    }

    function calcAPY(VestingId vesting, uint stakeSize) external view started returns(uint) {
        require(vesting != VestingId.EMPTY, 'WrongVesting');

        return vestings[vesting].rewardsPerDay.mul(365).mul(100).div(totalStaked[vesting].add(stakeSize));
    }

    function fullAmountOfTokens() external view returns(uint) {
        return rewardToken.totalSupply();
    }

    function howMuchToClaimIsLeft() external view started userIsStaking returns(uint) {
        return _howMuchToClaimIsLeft(msg.sender);
    }

    function _howMuchToClaimIsLeft(address addr) internal view returns(uint) {
        Staker storage staker = stakers[addr];
        IVesting vesting = vestings[staker.vesting].strategy;

        return vesting.calcVestedAmount(staker.stake.startTime, staker.stake.initialSize)
                      .sub(staker.stake.initialSize.sub(staker.stake.currentSize));
    }

    function increaseRewardsPool(uint amount) external onlyOwner {
        rewardToken.transferFrom(msg.sender, address(this), amount);
        rewardsPool = rewardsPool.add(amount);
    }

    function _updateRewardsPerToken(VestingId vestingId) internal {
        Vesting storage vesting = vestings[vestingId];

        if (block.timestamp > vesting.lastUpdateTime && totalStaked[vestingId] > 0) {
            vesting.rewardsPerToken = vesting.rewardsPerToken.add(
                ((block.timestamp).sub(vesting.lastUpdateTime)).mul(1e18).div(totalStaked[vestingId])
            );

            vesting.lastUpdateTime = block.timestamp;
        }
    }

    function _updateRewards(address addr) internal {
        Staker storage staker = stakers[addr];
        _updateRewardsPerToken(staker.vesting);

        staker.unclaimedRewards = _calcRewards(addr);
        staker.rewardsPerToken = vestings[staker.vesting].rewardsPerToken;
    }

    function _calcRewards(address addr) internal view returns(uint) {
        Staker storage staker = stakers[addr];
        Vesting storage vesting = vestings[staker.vesting];
        
        return staker.unclaimedRewards.add(
            vesting.rewardsPerDay.mul(staker.stake.currentSize)
                                 .mul(vesting.rewardsPerToken.sub(staker.rewardsPerToken))
                                 .div(1e18).div(1 days)
        );
    }

    modifier started {
        require(isStarted == true, 'Staking not started yet');
        _;
    }

    modifier notStarted {
        require(isStarted == false, 'Staking already started');
        _;
    }

    modifier initialized {
        require(
            address(vestings[VestingId.DAYS_30].strategy) != address(0) &&
            address(vestings[VestingId.DAYS_30].strategy) != address(0),
            'Staking not initialized'
        );
        _;
    }

    modifier newUser {
        require(stakers[msg.sender].vesting == VestingId.EMPTY, 'User already participates in staking');
        _;
    }

    modifier userIsStaking {
        require(stakers[msg.sender].vesting != VestingId.EMPTY, "User haven't staked yet");
        _;
    }
}