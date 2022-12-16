import { ethers } from "hardhat";
import { expect } from "chai";

import { deployInitCode } from "./deploy";

const isMain = require.main === module;

async function main() {
    const AnyCode = await ethers.getContractFactory("AnyCode");
    const anyCode = await AnyCode.deploy();

    const Simple = await ethers.getContractFactory("Simple");
    const simple = await Simple.deploy();

    const salt = 0;

    // predicted addresses (independent of the contracts to deploy)
    const fromFinalAddr = await anyCode.getAddrFromSalt(salt, false);
    const fromInitCodeAddr = await anyCode.getAddrFromSalt(salt, true);

    // deployFromFinalCode doesn't support constructors. Luckily, Simple
    // doesn't have one. Just like with proxies, if needed, one must initiliaze
    // the deployed contract explicitly by calling an init function.
    // NOTE: simpleFinalCode can be hardcoded: there's no need to deploy Simple.
    const simpleFinalCode = await ethers.provider.getCode(simple.address);
    await anyCode.deployFromFinalCode(simpleFinalCode, salt);

    let addr = await anyCode.lastAddress();
    expect(addr).to.equal(fromFinalAddr);
    const new_simple = Simple.attach(addr);
    console.log(`new_simple   deployed @ ${new_simple.address}`);

    await new_simple.setValue(123);
    expect((await new_simple.value()).toNumber()).to.equal(123);

    // SimpleWC has a constructor, but, luckily, deployFromInitCode supports
    // constructors without the need for any manual initialization.
    // Here's the process:
    // 1. we call deployInitcode to deploy SimpleWC's initcode.
    //    * Yes: simpleWC_icode will contain the initcode itself, NOT the code
    //    returned by it!
    //    * Note that we pass some arguments to the constructor.
    // 2. we call deployFromInitCode, which deploys the final code.
    //    * It does this by delegatecalling the initcode at simpleWC_icode!
    //    * Note that we send some ether to the constructor.
    const SimpleWC = await ethers.getContractFactory("SimpleWithCons");
    const initialValue = 456;
    const prefix = "new_simpleWC says: ";
    const weiToSend = ethers.utils.parseEther("1");
    const simpleWC_icode = await deployInitCode(SimpleWC, initialValue, prefix);
    await anyCode.deployFromInitCode(simpleWC_icode.address, salt, {value: weiToSend});

    addr = await anyCode.lastAddress();
    expect(addr).to.equal(fromInitCodeAddr);
    const new_simpleWC = SimpleWC.attach(addr);
    console.log(`new_simpleWC deployed @ ${new_simpleWC.address}\n`);
    await new_simpleWC.consoleLog("Here I am!");

    expect((await new_simpleWC.value()).toNumber(), "").to.equal(initialValue);
    expect((await ethers.provider.getBalance(new_simpleWC.address))).to.equal(weiToSend);
}

if (isMain) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
