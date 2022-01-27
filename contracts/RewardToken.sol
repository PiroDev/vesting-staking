pragma solidity ^0.8.0;

// SPDX-License-Identifier: Unlicensed

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract RewardToken is ERC20, Ownable {
    constructor() ERC20('Cool Reward Token', 'CRT') {}

    function mint(address to, uint amount) onlyOwner external {
        _mint(to, amount);
    }
}