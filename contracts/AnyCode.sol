// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// IMPORTANT: This is just a POC. Modify/extend it any way you see fit.
contract AnyCode {
    address initCodeContract;
    bytes public finalCode;

    // these two can be made into constants
    bytes public finalCodeDeployer =
        hex"63FFFFFFFF6000526000806004601c82335af1601a57600080fd5b3d6000803e3d6000f3";
    bytes public initCodeRunner =
        hex"63FFFFFFFF600052602060006004601c82335af1601b57600080fd5b600080808080515af4602c57600080fd5b3d6000803e3d6000f3";

    address public lastAddress;

    constructor() payable {
        // can be hardcoded
        uint32 selector = uint32(AnyCode.getFinalCode.selector);
        finalCodeDeployer[1] = bytes1(uint8(selector >> 24));
        finalCodeDeployer[2] = bytes1(uint8(selector >> 16));
        finalCodeDeployer[3] = bytes1(uint8(selector >> 8));
        finalCodeDeployer[4] = bytes1(uint8(selector));

        // can be hardcoded
        selector = uint32(AnyCode.getInitCodeContract.selector);
        initCodeRunner[1] = bytes1(uint8(selector >> 24));
        initCodeRunner[2] = bytes1(uint8(selector >> 16));
        initCodeRunner[3] = bytes1(uint8(selector >> 8));
        initCodeRunner[4] = bytes1(uint8(selector));
    }

    // called by finalCodeDeployer
    // (Is there a cleaner way to return the code?)
    function getFinalCode() external view {
        bytes memory code = finalCode;      // code is a copy in memory
        assembly {
            return(add(code, 32), mload(code))
        }
    }

    // called by initCodeRunner
    function getInitCodeContract() external view returns (address) {
        return initCodeContract;
    }

    function getAddrFromSalt(
        uint salt, bool fromInitCode
    ) public view returns(address) {
        bytes storage code = fromInitCode ? initCodeRunner : finalCodeDeployer;

        return address(uint160(uint256(
            keccak256(abi.encodePacked(
                uint8(0xff), address(this), salt, keccak256(code)
            ))
        )));
    }

    function deployFromFinalCode(
        bytes calldata _finalCode,
        uint salt
    ) external {
        finalCode = _finalCode;

        address addr;
        bytes memory initCode = finalCodeDeployer;

        assembly {
            addr := create2(0, add(initCode, 32), mload(initCode), salt)
        }
        require(addr != address(0), "create2 failed");
        lastAddress = addr;
    }

    function deployFromInitCode(
        address _initCodeContract,
        uint salt
    ) external payable {
        initCodeContract = _initCodeContract;

        address addr;
        bytes memory initCode = initCodeRunner;

        assembly {
            addr := create2(callvalue(), add(initCode, 32), mload(initCode), salt)
        }
        require(addr != address(0), "create2 failed");
        lastAddress = addr;
    }
}
