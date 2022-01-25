pragma solidity ^0.8.0;

// SPDX-License-Identifier: Unlicensed

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './IVestingStrategy.sol';

contract CoolVestingStaking is Ownable {
    using SafeMath for uint256;

    struct Staker {
        uint stakeSize;
        uint unclaimedRewards;
        uint lastRewardsUpdateTime;
    }

    enum State { CREATED, INITIALIZED, STARTED }

    IERC20 public rewardToken;
    IVestingStrategy public vestingStrategy;

    address[] public whitelisted;
    mapping(address => bool) public isWhitelisted;
    mapping(address => Staker) public stakers;
    uint public rewardSize;
    uint public totalStaked;

    State public state;
    uint public startTime;

    constructor(address _owner, IERC20 _rewardToken) {
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }

        rewardToken = _rewardToken;
        totalStaked = 0;
        state = State.CREATED;
    }

    function initialize(address[] calldata _whitelisted, uint _initStakeSize, uint _rewardSize, IVestingStrategy _vestingStrategy) external onlyOwner {
        require(state == State.CREATED, 'Contract must be in "CREATED" state');

        setVestingStrategy(_vestingStrategy);
        rewardSize = _rewardSize;

        for (uint i = 0; i < _whitelisted.length; i++) {
            addToWhitelist(_whitelisted[i]);
            stakers[_whitelisted[i]].stakeSize = _initStakeSize;
        }

        state = State.INITIALIZED;
    }

    function start() external onlyOwner {
        require(state == State.INITIALIZED, 'Contract must be in "INITIALIZED" state');

        startTime = block.timestamp;

        for (uint i = 0; i < whitelisted.length; i++) {
            address stakerAddress = whitelisted[i];
            uint stakeSize = stakers[stakerAddress].stakeSize;
            Staker storage staker = stakers[stakerAddress];

            rewardToken.transferFrom(stakerAddress, address(this), staker.stakeSize);
            totalStaked += stakeSize;
            staker.lastRewardsUpdateTime = startTime;
        }

        state = State.STARTED;
    }

    function addToWhitelist(address _address) public onlyOwner {
        require(isWhitelisted[_address] == false, 'Address is already in whitelist');

        whitelisted.push(_address);
        isWhitelisted[_address] = true;
    }

    function removeFromWhitelist(address _address) public onlyOwner {
        require(isWhitelisted[_address], 'Address must be whitelisted');
        isWhitelisted[_address] = false;

        for (uint i = 0; i < whitelisted.length; i++) {
            if (whitelisted[i] == _address) {
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

    function setVestingStrategy(IVestingStrategy _vestingStrategy) public onlyOwner {
        require(_vestingStrategy != vestingStrategy, 'New vesting strategy must be different from current one');

        vestingStrategy = _vestingStrategy;
    }

    function setRewardSize(uint _rewardSize) external onlyOwner {
        rewardSize = _rewardSize;

        for (uint i = 0; i < whitelisted.length; i++) {
            _updateRewards(whitelisted[i]);
        }
    }

    function claimRewards() public onlyWhitelisted {
        require(state == State.STARTED, 'Contract must be in "Started" state');

        _updateRewards(msg.sender);
        Staker storage staker = stakers[msg.sender];

        if (staker.unclaimedRewards > 0) {
            require(rewardsPool() >= staker.unclaimedRewards, 'Reward pool must be sufficient');

            rewardToken.transfer(msg.sender, staker.unclaimedRewards);
            staker.unclaimedRewards = 0;
        }
    }

    function _updateRewards(address _address) internal {
        Staker storage staker = stakers[_address];

        uint stakingTimedelta = block.timestamp.sub(staker.lastRewardsUpdateTime);
        uint reward = calcRewards(staker.stakeSize, stakingTimedelta);
        staker.unclaimedRewards = staker.unclaimedRewards.add(reward);
        staker.lastRewardsUpdateTime = block.timestamp;
    }

    function calcRewards(uint stakeSize, uint stakingTimedelta) public view returns(uint reward) {
        require(state == State.STARTED, 'Contract must be in "Started" state');
        require(totalStaked > 0, 'Token must be staked');

        return stakingTimedelta.div(1 days).mul(rewardSize).mul(stakeSize).div(totalStaked);
    }

    function calcAnnualPercentYield() public view returns(uint) {
        require(state == State.STARTED, 'Contract must be in "Started" state');

        return rewardSize.mul(365).mul(100).div(totalStaked);
    }

    function unstake(uint _amount) external onlyWhitelisted {
        require(state == State.STARTED, 'Contract must be in "Started" state');

        Staker storage staker = stakers[msg.sender];
        uint stakerAllowedToUnstake = vestingStrategy.calcVestedAmount(startTime, staker.stakeSize); 
        require(stakerAllowedToUnstake >= _amount, 'Such amount of tokens are not vested yet');
        
        staker.stakeSize -= _amount;
        totalStaked -= _amount;
        rewardToken.transfer(msg.sender, _amount);
        _updateRewards(msg.sender);
    }

    function rewardsPool() public view returns(uint) {
        return rewardToken.balanceOf(address(this)) - totalStaked;
    }

    function allowanceThatCouldBeClaimed() public view returns(uint) {
        require(state == State.STARTED, 'Contract must be in "Started" state');

        return vestingStrategy.calcVestedAmount(startTime, totalStaked);
    }
}