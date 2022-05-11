# LUKSO UP Hammer

A network stress testing tool


## Install
```bash
git clone git@github.com:lukso-network/tools-up-hammer.git
cd tools-up-hammer
npm i
```

## Running

### config.json

The config.json file provides a central location to control how up-hammer will operate.

**provider** provider network endpoint

**chainId** chain ID for network

**wallets** currently two wallets are used to separate deployments using lspFactory from web3 contract method calls. These two wallets are referred to as ``deploy`` and ``transfer`` respectively. Each must contain an ``address`` and ``privateKey``.

**deployLimits** the number of deployments that will happen before deployments are ignored. Separate limits can be set for ``up``, ``lsp7``, and ``lsp8``.

**maxDelay** the maximum delay in milliseconds between transfer calls are attempted

**devLoop** for development purposes, if a particular order of deployments is preferred before random deployments commence. For example, the following would deploy and LSP7, then an LSP8, mint an LSP8, and then mint LSP7.
```json
[
    "loop_deployLSP7",
    "loop_deployLSP8",
    "loop_mintLSP8",
    "loop_mintLSP7"
]
```

**logLevel** defines the log level for output. The log levels are defined in ``logging.js``
```javascript
const DEBUG = 0;
const VERBOSE = 1;
const INFO = 2;
const QUIET = 3;
```

**txErrorLog** file name where transaction hashes of reverts are stored to be used by the error logging tool (currently named blocksout.js)

**deployProxy** set to false if you want to deploy full contracts when creating the Universal Profile. Recommend to leave true

**presets** see presets section

### presets.json

The concept of presets is to provide addresses of pre-deployed UPs and LSPs to expedite script initialization. Currently there are bugs when using LSP presets, so these are empty. 

Because UPs and deployed with a specific controller address, the top level keys must be the address of the controlling account that initially deployed them. 

### Usage

```bash
node uphammer.js
```

TODO provide custom config file, run from within another script, etc.

## blockscout.js

A buggy, experimental tool to iterate over the failed transaction hashes and print the revert reason to screen.

## TODO

Consolidate wallets.
Handle nonce issues.
