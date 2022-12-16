// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "hardhat/console.sol";

contract SimpleWithCons {
    uint public value;
    string prefix;

    constructor(uint startValue, string memory _prefix) payable {
        require(msg.value >= 1 ether, "You need to send at least 1 ether");

        value = startValue;
        prefix = _prefix;
    }

    function consoleLog(string calldata text) external view {
        console.log(string.concat(prefix, text));
    }

    function setValue(uint _value) public {
        value = _value;
    }
}
