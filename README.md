# LUKSO UP Hammer

A network stress testing tool

## Architecture

The tool requires two sets of funded EOAs. This is because deployments of UPs and LSPs use lspFactory, which expects the nonces to not change during deployments. Minting and Transfers happen in a separate loop at rapid speed, so require their own EOA to manage nonces. At startup, the script will check the balances of both EOAs. If either account is empty, the script will terminate.

TODO - implement regular checks for funds and handle when an EOA is without funds by exiting.

### Deployments
Deployments can be of 3 types: UP, LSP7, and LSP8. Both EOAs are added as controllers when deployed. Once deployed, the UP or LSP is saved to the scripts internal state and can be used for minting and transferring. If **savePresets** is set to **true** in the config.json file, the address of the deployed entity will be saved in the file specified in **presetsFile** in config.json. These presets can then be reloaded later by passing the presets file to the script. This makes hammering more efficient as deployments take time. A **deploymentDelay** variable in config.json allows for setting the delay between deployments. 

### Transfers
Minting and Transfers run in a loop with a timer that is controlled by  **maxDelay** in the config. It is currently set to 0. For development purposes, this can be tampered with. During testing, with a **maxDelay** of 0, the TX output can range up to 1500 per monitor cycle. This is admittedly not very high. When the script starts to max our CPU or Memory, TX output begins to drop off. If **backoff** in the config is also set to high, the presence of errors can cause the script to get stuck for a moment while the backoff reduces to 0. The **backoff** in config.json is set to 15ms.

Work can be done to speed up the script. A likely slowdown is what the script does to attempt to make a proper TX. It tries to find an LSP with funds. And then finds out who has funds or owns the LSP8 token, and then sends to a randomly selected UP. All these calculations use `await`, which means the TX is slowed down. If better insight to whether TXs were mined as Reverts were added into the script, alot of these checks could be removed, because a Revert is still valid in our case. We really don't care if the TX succeeded, only that it was mined.

Because TXs can be dropped from the mempool at any time, nonces can go missing. Because nonces are required to increment by 1 for each request, a missing nonce will prevent all subsequent TXs from being mined. Because of this an additional loop is running on a timer that will check for all the TX hashes stored in the state's `pendingTxs` array. If the TX hash is not found in the mempool, the nonce is added to `droppedNonces` and will be replayed. The timer for the nonce check is **nonceCheckDelay** in the config. We initially set this to 5 seconds, but have changed it to 10 seconds. The reason for this is that if a nonce is replayed and the mempool has two transactions with the same nonce, the node will return a `replacement transaction underpriced` error. When this happens, that nonce must be replayed again but with higher gas. The **gasIncrement** in the config (defaults to 1) determines how much the replayed gas will be for that nonce. When **nonceCheckDelay** was set to 5s, an apparent race condition was happening that caused a high amount of `replacement transaction underpriced` errors, which wastes alot of time and TX output. Incrementing this to 10s seemed to solve this problem. 

When selecting a nonce for a TX, the script first inspects `droppedNonces` and `incrementGasPrice` arrays for a nonce. If both arrays have a nonce, it will take whichever nonce is lower.

### Monitoring 
The **monitorDelay** in the config defaults to 5 seconds. When **logLevel** is set to 3 (`MONITOR`), the monitoring output will refresh information about what has happened since the last monitor cycle. The exceptions to this refresh are **Pending TXs** and **Nonces** displays: these reflect what is actually stored in the state at the time. 

It is not recommended to set the **logLevel** to anything other than 3 unless you are doing development. If it is lower than 3, increasing **maxDelay** or piping output to a file will be necessary to make sense of the output.

The monitoring output 
**Tx Sent** The number of mint or transfer calls that were made during the monitor cycle
**Max Delay** max delay in ms set in the config
**Backoff** current backoff in ms. The backoff is added to `maxDelay` between each transfer. It decrements by 1 for each request. If `backoff` does not 
move between monitor cycles, it is likely the script is stuck because of some resource constraints on the machine itself. Or check **Network Failures** output to see if the RPC endpoint is hanging up
**Successes** The number of types .on('receipt'...) is called from minting and transfer calls during the monitor cycle. This is often a low amount and is likely because Reverts are not being counted. There are likely alot of reverts happening.
**Pending** The number of pending TXs in the local state. This does not refresh between monitoring cycles
**Errors** Application level errors. 
    **Underpriced** A `replacement transaction underpriced` error was recieved. The nonce will then be added to the `incrementGasPrice` queue 
    **Transaction Receipt** The server returned a `Failed to get Transaction Receipt` error. Why this happens is not really known.
    **Invalid JSON** Either the RPC endpoint returned garbage, indicating some sort of failure, OR, the application returned something we don't understand. 
    **Nonce too low** The nonce is too low. These errors are usually seen in the beginning, but will correct themselves.
    **Misc** An error not accounted for in the above. If this number gets high and the script is stalling, its probably worth investigating.
**Network Failures** Network level errors. These indicate that a failure is occuring on the network. Keep in mind this could be a result of spamming your own network, and is not necessarily an indication of the health of the LB
   **Socket Hang up**
   **Disconnected preTLS** 
   **ECONNRESET**
   **ECONNREFUSED** 
   **ETIMEDOUT**
**Nonces: Current** the current nonce at the moment the monitor cycle is reporting. This is taken directly from the state.
   **Dropped** The number of dropped nonces 
        **Next** this is the lowest nonce in the `droppedNonces` array. Useful to compare to the current nonce
   **Incrementing Gas Price** The number of nonces that need to be replayed with a higher gas price.
        **Next** this is the lowest nonce in the `incrementGasPrice` array
    
## Install
```bash
git clone git@github.com:lukso-network/tools-up-hammer.git
cd tools-up-hammer
npm i
```

TODO version pinning

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
const MONITOR = 3
const QUIET = 4;
```

**txErrorLog** file name where transaction hashes of reverts are stored to be used by the error logging tool (currently named blocksout.js) NOTE blockscout.js is currently broken. Was working on L14 but not L16 explorer.

**deployProxy** set to false if you want to deploy full contracts when creating the Universal Profile. Defaults to false. Setting to true caused problems on L16

**presets** see presets section

**savePresets** (boolean) whether to save deployed UPs and LSPs into the presets file

**presetsFile** (string) file to save presets to. NOTE right now this file must already exist. No check is made to create the file. This can be omitted if `savePresets` is set to false.

**deployOnly**  (boolean) if set to true, the script will only deploy UPs and LSPs. This is only useful with `savePresets` set to true, and an existing presets file in the config. Use this to fill up a profile with UPs and LSPs in preparation for hammering.

**deployReactive** (boolean) set this to false. This entire feature needs to be reworked or removed

**defaultGasPrice** (string|number??) defaults to "1000000000"

**gasIncrement** (number) defaults to 1

**backoff** (number) when an error occurs, how many milliseconds should be added to `maxDelay` between each transfer loop. This number will decrement by 1 every time it is hit. Defaults to 15ms

### presets.json

The concept of presets is to provide addresses of pre-deployed UPs and LSPs to expedite script initialization. Currently there are bugs when using LSP presets, so these are empty. 

Because UPs and deployed with a specific controller address, the top level keys must be the address of the controlling account that initially deployed them. 

### Usage

uphammer can be run within another script, or from the command line.

From within a script
```javascript
const uphammer = new UPHammer(config, presets);
uphammer.start();
```
If `presets` is null, an empty object will be used.

From the command line, the `cli.js` script can be run. If no config file is provided, the config.json provided in this repo will be used. A custom config file can be passed as the first argument. This will overwrite variables in config.json that are specified in the custom config file. Config variables not set in the custom config will default to those in config.json. A second option argument is a presets.json file. If no custom config file is desired, a presets file can be passed as the first argument, but the filename MUST start with `preset`, otherwise the script will not understand it.

The recommended way to run uphammer is to use one of the helper scripts
uphammerProfile.sh
and
uphammerProfileEnv.sh

Both of these employ what we are calling UPHammer Profiles, which are not to be confused with Universal Profiles. Not the best naming convention for this, but here we are. In this repo there are two directories, profiles and presets. The profiles directory has different config files numbered by their profile number. They have corresponding preset files in the presets directory. These config profiles have prefunded EOAs that have deployed the UPs and LSPs in their corresponding presets file. This is the recommended way to run uphammer.

For example, to run profile 1
```bash
./uphammerProfile.sh 1
```

To run profile 9,
```bash
./uphammerProfile.sh 9
```

To deploy in a Kubernetes swarm, we need to run a script that takes the profile number from somewhere not supplied on the commandline. Environment variables can be injected into containers when deployed, so the `uphammerProfileEnv.sh` file does the same thing as `uphammerProfile.sh`, except it takes the profile number from the `UPHAMMER_PROFILE` environment variable

```bash
export UPHAMMER_PROFILE=3
./uphammerProfile.sh
```