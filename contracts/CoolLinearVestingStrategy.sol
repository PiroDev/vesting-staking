pragma solidity ^0.8.0;

// SPDX-License-Identifier: Unlicensed

import './IVestingStrategy.sol';

contract CoolLinearVestingStrategy is IVestingStrategy {
    uint immutable public cliffDuration;
    uint immutable public releaseDuration;

    constructor(uint _cliffDurationDays, uint _releaseDurationDays) {
        cliffDuration = _cliffDurationDays * 1 days;
        releaseDuration = _releaseDurationDays * 1 days;
    }

    function calcVestedAmount(uint _startTime, uint _allowance) external view override returns(uint) {
        uint vestedAmount = 0;
        uint timedelta = block.timestamp - _startTime;

        if (timedelta >= cliffDuration) {
            if (timedelta >= cliffDuration + releaseDuration) {
                vestedAmount = _allowance;
            } else {
                vestedAmount = (timedelta - cliffDuration) * _allowance / releaseDuration;
            }
        }

        return vestedAmount;
    }
}