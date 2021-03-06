pragma solidity ^0.8.0;

// SPDX-License-Identifier: Unlicensed

interface IVesting {
    function calcVestedAmount(uint _startTime, uint _allowance) external view returns(uint);
}