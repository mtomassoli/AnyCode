// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract Simple {
    uint public value;

    function setValue(uint _value) public {
        value = _value;
    }
}
