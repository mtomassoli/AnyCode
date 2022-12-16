import { Contract, ContractInterface } from "@ethersproject/contracts/src.ts/index";
import { Provider, TransactionResponse } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { getAddress } from "@ethersproject/address";
import { defineReadOnly, getStatic } from "@ethersproject/properties";
import { ParamType } from "@ethersproject/abi";

import { Logger } from "@ethersproject/logger";

const logger = Logger.globalLogger();

const initCodeDropper = "0x600d80380380916000396000f3";

// This puts on the EVM the initcode itself instead of the finalcode returned by it.
export async function deployInitCode(factory: any, ...args: Array<any>): Promise<Contract> {

    let overrides: any = { };

    // If 1 extra parameter was passed in, it contains overrides
    if (args.length === factory.interface.deploy.inputs.length + 1) {
        overrides = args.pop();
    }

    // Make sure the call matches the constructor signature
    logger.checkArgumentCount(args.length, factory.interface.deploy.inputs.length, " in Contract constructor");

    // Resolve ENS names and promises in the arguments
    const params = await resolveAddresses(factory.signer, args, factory.interface.deploy.inputs);
    params.push(overrides);

    // Get the deployment transaction (with optional overrides)
    const unsignedTx = factory.getDeployTransaction(...params);

    //----------- THIS IS THE ONLY REAL CHANGE TO THE ETHER.JS CODE -----------
    // prepend our dropper
    unsignedTx.data = initCodeDropper + unsignedTx.data.slice(2);
    //-------------------------------------------------------------------------

    // Send the deployment transaction
    const tx = await factory.signer.sendTransaction(unsignedTx);
    await tx.wait();

    const address = getStatic<(tx: TransactionResponse) => string>(factory.constructor, "getContractAddress")(tx);
    const contract = getStatic<(address: string, contractInterface: ContractInterface, signer?: Signer) => Contract>(factory.constructor, "getContract")(address, factory.interface, factory.signer);

    defineReadOnly(contract, "deployTransaction", tx);
    return contract;
}

// Recursively replaces ENS names with promises to resolve the name and resolves all properties
async function resolveAddresses(resolver: Signer | Provider, value: any, paramType: ParamType | Array<ParamType>): Promise<any> {
    if (Array.isArray(paramType)) {
        return await Promise.all(paramType.map((paramType, index) => {
            return resolveAddresses(
                resolver,
                ((Array.isArray(value)) ? value[index]: value[paramType.name]),
                paramType
            );
        }));
    }

    if (paramType.type === "address") {
        return await resolveName(resolver, value);
    }

    if (paramType.type === "tuple") {
        return await resolveAddresses(resolver, value, paramType.components);
    }

    if (paramType.baseType === "array") {
        if (!Array.isArray(value)) {
            return Promise.reject(logger.makeError("invalid value for array", Logger.errors.INVALID_ARGUMENT, {
                argument: "value",
                value
            }));
        }
        return await Promise.all(value.map((v) => resolveAddresses(resolver, v, paramType.arrayChildren)));
    }

    return value;
}

async function resolveName(resolver: Signer | Provider, nameOrPromise: string | Promise<string>): Promise<string | null> {
    const name = await nameOrPromise;

    if (typeof(name) !== "string") {
        logger.throwArgumentError("invalid address or ENS name", "name", name);
    }

    // If it is already an address, just use it (after adding checksum)
    try {
        return getAddress(name);
    } catch (error) { }

    if (!resolver) {
        logger.throwError("a provider or signer is needed to resolve ENS names", Logger.errors.UNSUPPORTED_OPERATION, {
            operation: "resolveName"
        });
    }

    const address = await resolver.resolveName(name);

    if (address == null) {
        logger.throwArgumentError("resolver or addr is not configured for ENS name", "name", name);
    }

    return address;
}
