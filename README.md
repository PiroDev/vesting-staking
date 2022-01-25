# Vesting Staking

Implementation of ERC20 staking system with vesting using Solidity (0.8) and Hardhat.

Staking system consists of 3 parts:

- CoolRewardToken contract: implementation of ERC20 token used as reward token for staking system.
- CoolLinearVestingStrategy: implementation of linear vesting strategy with cliff period.
- CoolVestingStaking: implementation of staking system with vesting for staked tokens.
