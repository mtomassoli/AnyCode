# AnyCode

This is a little POC which shows that CREATE2 can be used to put any bytecode at a fixed address.

I've just realized that, unfortunately (for me, at least ;( ), this is already well-known, so I've wasted 2 days of my life!

I started learning about Ethereum 3 months ago so there's much I still don't know about its ecosystem.
I've mainly been doing CTFs and challenges to get ready for auditing and bug hunting.

I decided to release this anyway, since maybe I did things a little differently than other people.

## Setup

You can install the dependencies with

```shell
npm install
```

and run the POC with

```shell
npx hardhat run scripts/poc.ts
```

I don't like tests because I find them harder to debug and I don't feel free to do things the way I want. Maybe I'll change my mind in the future.

## How it works

CREATE2 determines the *deployment address* from the *initcode*, not the code returned by it. This means that we can use a single *initcode* that gets the *final code* from somewhere else. The *initcode* is always the same, ergo the *deployment address* doesn't change, but the *final code* does change.

I thought of two ways to do this:

1. CREATE2-deploy a fixed *initcode* that calls `AnyCode(msg.sender).getFinalCode` to get the code to return. See `AnyCode.deployFromFinalCode`. This doesn't support constructors.
2. This supports constructors and has two steps. Let's say we want to deploy a contract *C*.
   1. Deploy an *initcode* that returns the *initcode* itself of *C*. This becomes a *C factory*.
   2. CREATE2-deploy a fixed *initcode* that:
      1. calls `AnyCode(msg.sender).getInitCodeContract` to get the address of the *C factory*.
      2. DELEGATE-calls the *C factory* to build *C* in place.

## Usage

The first method is very easy to use:

```js
await anyCode.deployFromFinalCode(finalCode, salt);
const addr = await anyCode.lastAddress();
```

`finalCode` is the code returned by an *initcode*. Since the *finalcode* doesn't include a *constructor*, one needs to initialize the contract by calling some kind of init function just like with proxies.


The second method, as said before, has two steps, which I decided to keep separate. Let's say we want to deploy a contract `Foo`:

```js
const foo_icode = await deployInitCode(FooFactory, constArg1, ...);
await anyCode.deployFromInitCode(foo_icode.address, 0, {value: weiToSend, ...});
const addr = await anyCode.lastAddress();
```

I'm using *ethers.js*, which lets us deploy a contract by first creating a factory, `FooFactory`, and then call its `deploy` method to deploy it.

Since I wanted the final code to contain *not* the code returned by `Foo`'s *initcode*, but `Foo`'s *initcode* itself, I modified `deploy`.

I created my `deployInitCode` (see `scripts/deploy.ts`) by shamelessly copying the implementation of the original `deploy`, removing some unneeded code, and adding the line

```js
unsignedTx.data = initCodeDropper + unsignedTx.data.slice(2);
```

where

```js
const initCodeDropper = "0x600d80380380916000396000f3";
```

`unsignedTx.data` contains the initcode, so we prepend `initCodeDropper` (the `slice` removes the initial `'0x'`).
`initCodeDropper` simply returns the code that follows it. We've basically built an *initinitcode*.

You can find an "explanation" for the bytecode in `asm/initCode_dropper.asm.txt`. Since this one is very short, here it is:

```text
NOTE: All values are in hex


codecopy(0, start, codesize - start)
    push1   start                                   60 0d
    dup1                                            80
    codesize                                        38
    sub                                             03
    dup1                                            80
    swap2                                           91
    push1   0                                       60 00
    codecopy                                        39
return(0, codesize - start)
    push1   0                                       60 00
    return                                          f3
start:                                          0d:
    <follows payload (initCode)>
```

Yeah, I did everything by hand.

## A few notes

First of all, `AnyCode` is not optimized. For instance, `finalCodeDeployer` and `initCodeRunner` can be changed into constants as the patching in the constructor is not really needed. It was useful when I was still changing things.

Being still a noob, I couldn't find a clean way to return a bytes array from a solidity function, so I ended up with this:

```solidity
function getFinalCode() external view {
    bytes memory code = finalCode; // code is a copy in memory
    assembly {
        return(add(code, 32), mload(code))
    }
}
```

Note that I skipped the length field since it isn't needed.

## Usefulness

Does anyone have any use for contract factories and deployment through DELEGATECALLing them? Let me know if you do.

Hmm... Why do we use proxies? So that we don't break dependencies. Couldn't we exploit the predictability of the deployment addresses to make self-updating/repairing connections?

For instance, we can decide that all future versions of our contract *C* will have certain fixed addresses in a certain sequence. Moreover, we just need to memorize the address of the deploying contract (e.g. `AnyCode`) since the future addresses can then be deterministically determined by considering a simple sequence of salts such as 0, 1, 2, ... .

I can't think of anything else at the moment!

Happy coding/hacking!
