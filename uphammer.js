const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8IdentifiableDigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP8IdentifiableDigitalAsset.json');

const Web3 = require('web3');
const fs = require('fs');

const crypto = require('crypto');
const delay = require('await-delay');

const {initUP, randomIndex } = require('./lib');
const actions = require('./actions');
const config = require("./config.json");
const utils = require("./utils");

const {log, warn, DEBUG, VERBOSE, INFO, MONITOR, QUIET} = require('./logging');

let {state} = require("./state");

// we need to override _onHttpRequestError to get network failure information
const XHR = require('xhr2-cookies').XMLHttpRequest

XHR.prototype._onHttpRequestError = function (request, error) {
    try {
        if (this._request !== request) {
            return;
        }
        
        let msg = error.toString();
        if(msg.includes("ECONNRESET")) {
            state.monitor.networkFailures.econnreset++
        } else if(msg.includes("ECONNREFUSED")) {
            state.monitor.networkFailures.econnrefused++
        } else if(msg.includes("Client network socket disconnected before secure TLS connection was established")) {
            state.monitor.networkFailures.socketDisconnectedTLS++;
        } else if(msg.includes("socket hang up")) {
            state.monitor.networkFailures.socketHangUp++;
        } else if(msg.includes("ETIME")) {
            state.monitor.networkFailures.timedout++;
        } else if(msg.includes("ENOTFOUND")) {
            state.monitor.networkFailures.enotfound++;
        } else {
            console.log(error);
        }
        this._setError();
        request.abort();
        this._setReadyState(XHR.DONE);
        this._dispatchProgress('error');
        this._dispatchProgress('loadend');
    } catch(e) {
        errorHandler(state, e);
    }
};




class UPHammer {
    // the functions randomly selected in the deploy loop cycle
    deploy_actions = [
        actions.loop_deployUP,
        actions.loop_deployLSP7,
        actions.loop_deployLSP8,
    ]
    // the functions randomly selected in the transfer loop cycle
    transfer_actions = [
        actions.loop_transferLSP7,
        actions.loop_transferAllLSP7,
        actions.loop_transferLSP8,
        actions.loop_mintLSP7,
        actions.loop_mintLSP8,
    ];

    constructor(user_config, profile_or_user_presets) {
        // merge config
        this.config = config;
        this.mergeConfig(user_config);

        this.provider = this.config.provider; 
        log(`Provider is ${this.provider}`, INFO);
        log(`ChainId is ${this.config.chainId}`, INFO);
        // web3 is used for transferring and minting, not deployments
        this.web3 = new Web3(this.provider, this.config.wallets.transfer.privateKey);
        if(this.config.wsProvider) {
            this.ws = new Web3(this.config.wsProvider, this.config.wallets.transfer.privateKey);
            this.ws.eth.accounts.wallet.add(this.config.wallets.transfer.privateKey);
        }
        
        const EOA_transfer = this.web3.eth.accounts.wallet.add(this.config.wallets.transfer.privateKey);
        
        // deploy key is used for deployments
        const EOA_deploy = this.web3.eth.accounts.wallet.add(this.config.wallets.deploy.privateKey);
        
        
        const DEPLOY_PROXY = this.config.deployProxy;
        
        this.lspFactory = new LSPFactory(this.provider, {
          deployKey: this.config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
          chainId: this.config.chainId, // Chain Id of the network you want to connect to
        });
        
        let user_presets = {};
        let profile;
        if (typeof profile_or_user_presets === 'object') {
            user_presets = profile_or_user_presets;
        } else {
            profile = profile_or_user_presets;
        }

        // store presets in config if they are preset
        this.config.presets = user_presets ? user_presets : {};

        this.state = {...state,
            web3: this.web3,
            ws: this.ws,
            lspFactory: this.lspFactory,
            DEPLOY_PROXY,
            EOA: {
                deploy: EOA_deploy,
                transfer: EOA_transfer
            },
            config: this.config,
            profile
        };
    }

    

    mergeConfig = function(user_config) {
        for(let setting in user_config) {
            this.config[setting] = user_config[setting];
        }
    }

    init = async function(num_to_deploy) {
        let initialized = false;
        if(this.config.presets) {
            initialized = await this.loadPresets();
        } 

        if(!initialized) {
            for(let i=0; i < num_to_deploy; i++) {
                await initUP(this.state);
            }
        }
    }

    loadPresets = async function() {
        if (!this.config.presets[config.wallets.deploy.address]) { return false }
        // load UPs
        let presetUPs = this.config.presets[config.wallets.deploy.address] ? 
            this.config.presets[config.wallets.deploy.address].up : [];
        for(let i=0; i< presetUPs.length; i++) {
            let erc725_address = presetUPs[i].ERC725_ADDRESS;
            let km_address = presetUPs[i].KEYMANAGER_ADDRESS;
            log(`ERC725 address:     ${erc725_address}`, INFO, this.state);
            log(`KeyManager address: ${km_address}`, INFO, this.state);
            let erc725 = new this.state.web3.eth.Contract(UniversalProfile.abi, erc725_address);
            let km = new this.state.web3.eth.Contract(KeyManager.abi, km_address);
            this.state.up[erc725_address] = {
                erc725,
                km
            }
        } 
        // make sure we have deployed some UPs 
        if(Object.keys(this.state.up).length == 0) { return false; }

        let lsp7presets = this.config.presets[config.wallets.deploy.address].lsp7;
        for(let i=0; i<lsp7presets.length; i++) {
            let lsp7_address = lsp7presets[i];
            let lsp7_asset = new this.state.web3.eth.Contract(LSP7Mintable.abi, lsp7_address);
            let erc725_address;
            try {
                erc725_address = await lsp7_asset.methods.owner().call();
            } catch(e) {
                console.log(e);
            }
            log(`LSP7 address:       ${lsp7_asset._address}`, INFO, this.state);
            this.state.lsp7.addresses[lsp7_asset._address] = {
                owner: erc725_address
            }
        }

        let lsp8presets = this.config.presets[config.wallets.deploy.address].lsp8;
        for(let i=0; i<lsp8presets.length; i++) {
            let lsp8_address = lsp8presets[i];
            let lsp8_asset = new this.state.web3.eth.Contract(LSP8IdentifiableDigitalAsset.abi, lsp8_address);
            let erc725_address = await lsp8_asset.methods.owner().call();
            let totalSupply = await lsp8_asset.methods.totalSupply().call();
            let currentId = totalSupply;

            log(`LSP8 address:       ${lsp8_asset._address}`, INFO, this.state);
        
            this.state.lsp8.addresses[lsp8_asset._address] = {
                owner: erc725_address,
                totalSupply,
                currentId
            } 
        }

        return true;
    }

    continueDeployments = function () {
        let _continue = false;
        if(Object.keys(this.state.up).length <= this.config.deployLimits.up
            && Object.keys(this.state.lsp7.addresses).length <= this.config.deployLimits.lsp7
            && Object.keys(this.state.lsp8.addresses).length <= this.config.deployLimits.lsp8)
        {
            _continue = true;
        }
        return _continue;
    }

    deployActors = async function () {
        // wait until there are UPs loaded into state
        while(Object.keys(this.state.up).length === 0) {
            await delay(1000);
        }
        // run custom defined dev_loop
        for(const action of this.config.dev_loop) {
            await delay(this.config.deploymentDelay);
            await actions[action](this.state);
        }
        // the main deploy loop. Deploys up to the limits set in the config
        while(this.continueDeployments()) {
            let next = randomIndex(this.deploy_actions); 
            try {
                await this.deploy_actions[next](this.state);
                await delay(this.config.deploymentDelay);
            } catch (e) {
                warn(`Error during ${this.deploy_actions[next].name}`, INFO);
                console.log(e);
            }
        }
        log('Finished deployments', INFO);
    }

    doWebSocket = function() {
        this.ws.eth.getBalance(this.config.wallet.transfer.address)
                .then(balance => console.log(`[+] WS Balance ${balance}`))
                .catch(e => errorHandler(this.state, e));
    }

    runWebSocket = async function() {
        if(this.config.wsProvider) {
            while(true) {
                doWebSocket();
                await delay(this.config.webSocketDelay);
            }
        }
        
    }


    /***
     * This is the main loop for transfers. It runs at an interval set in config as maxDelay
     * A random index is selected from the `transfer_actions` array
     */
    runTransfers = async function () {
        while(true) {
            if(!this.state.c2c.pause) {
                let next = randomIndex(this.transfer_actions); 
                try {
                    if(Object.keys(this.state.up).length > 0) { 
                        this.transfer_actions[next](this.state);    
                    }
                } catch(e) {
                    warn(`error during ${this.transfer_actions[next].name}`, INFO);
                }
    
                // calculate the delay
                let timeToDelay;
                // crypto.randomInt cannot handle floats, so only select randomly if we are at 1 or above
                if(this.config.maxDelay >= 1) {
                    timeToDelay = crypto.randomInt(this.config.maxDelay) + this.state.backoff;
                } else if(this.config.maxDelay > 0) {
                    // if we are between 0 and 1, just use Math.random
                    timeToDelay = Math.random(this.config.maxDelay) + this.state.backoff;
                } else {
                    timeToDelay = 0 + this.state.backoff;
                }
                
                // apply backoff if it exists for this cycle
                this.state.backoff > 0 ? this.state.backoff-- : this.state.backoff = 0;
                this.state.monitor.tx.loop++;
                await delay(timeToDelay);
            } else {
                await delay(this.config.maxDelay);
            }
            
            
        }
    }

    /**
     * This function iterates through state.pendingTxs and looks up the txhashes found there.
     * The state.pendingTxs array stores objects of type {hash, nonce}
     * If no TX is found for that hash, the nonce is added to the state.droppedNonces array if it doesn't already exist
     */
    checkPendingTx = async function () {
        let hashes = Object.keys(this.state.pendingTxs);
        for(let i=0; i<hashes.length; i++) {
            
            let hash = hashes[i];
            // if the chain is already ahead of this nonce, we just clear it out
            if(this.state.pendingTxs[hash] < this.state.nonceFromChain) {
                delete this.state.pendingTxs[hash];
            } else {
                this.state.monitor.tx.checkPending++;
                this.web3.eth.getTransaction(hash)
                .then((tx) => {
                    if(!tx) {
                        // tx is dropped
                        utils.addNonceToDroppedNoncesIfNotPresent(this.state, this.state.pendingTxs[hash]);
                        delete this.state.pendingTxs[hash];
                    } else if(tx.blockNumber) {
                        // tx is mined
                        delete this.state.pendingTxs[hash];
                    }
                })
                .catch((e) => {
                    utils.errorHandler(this.state, e);
                    // console.log(e);
                })

            }
            

        }
    
    }

    /**
     * The loop that checks for dropped nonces. The `nonceCheckDelay` parameter in the config controls how often this is run
     */
    nonceCheck = async function () {
    
        while(true) {
            // we want to check on what the chain thinks our nonce is
            // current check is simple. We are in a timed loop set by nonceCheckDelay
            // if we see the same nonce twice from the chain, we add that nonce to dropped nonces
            // so basically the timer needs to be adjusted so we should see the nonce increment 
            // between loops
            let nonceFromChain = await this.web3.eth.getTransactionCount(this.config.wallets.transfer.address)
            
            if(this.state.nonceFromChain === nonceFromChain) {
                utils.addNonceToDroppedNoncesIfNotPresent(this.state, nonceFromChain);
            } else {
                this.state.nonceFromChain = nonceFromChain;
            }
               
            if(config.checkPendingTxs) {
                await this.checkPendingTx();
            }
            
            await delay(config.nonceCheckDelay);
        }
    }

    /**
     * Checks the balances of both deploy and transfer accounts and aborts if both are not funded
     */
    checkBalance = async function (wallet) {
        log(`Checking ${wallet} balance...`, QUIET, this.state);
        if(this.config.wallets[wallet] === undefined) {
            warn(`${wallet} wallet is not properly configured`, QUIET, this.state);
        }
        let address = this.config.wallets[wallet].address;
        let balance = await this.web3.eth.getBalance(address);
        log(`Balance: ${balance}`, QUIET, this.state);
        if (balance === '0') {
            warn(`[!] Go get some gas for ${this.config.wallets[wallet].address}`, QUIET, this.state);
            return false;
        }
        return true;
    }

    /**
     * The monitor cycle. Delay time is configured with `monitorDelay`
     */
    monitor = async function() {
        while(true) {
            await delay(this.config.monitorDelay);
            // check to see if the tool has stalled, but only if not paused
            if(!this.state.c2c.pause) {
                let loop = this.state.monitor.tx.loop;
                if (loop < config.stallReset.threshold) {
                    this.state.stallResetCycles++;
                } else {
                    this.state.stallResetCycles = 0;
                }
                if (this.state.stallResetCycles > config.stallReset.cycles) {
                    warn(`UPhammer stalled. exiting...`, MONITOR);
                    process.exit();
                }
            }
            
            utils.monitorCycle(this.state);
        }
    }



    updateBalance = async function() {
        while(true) {
            try {
                let balance = await this.state.web3.eth.getBalance(this.state.config.wallets.transfer.address);
                this.state.balance = balance;
            } catch(e) {
                utils.errorHandler(this.state, e);
            }
            await delay(this.state.config.balanceUpdateDelay);
        }
    }
    fundWallet = async function() {
        while(true) {
            utils.fund(this.state);
            let minute = 1000 * 60;
            let timeToWait = this.state.config.faucetDelayMinutes * minute;
            await delay(timeToWait);
        }
    }
    
    balanceAndFundLoop = async function() {
        this.updateBalance();
        this.fundWallet();

    }
    /**
     * Begins the chain hammering
     * Before beginning the loops, it 
     * - ensures both accounts are funded.
     * - makes a query to find the current nonce for the transfer account
     * - initializes the number of initial UPs specified in `config.initialUPs` to ensure there are UPs prior to entering the loops
     * Then starts the following loops
     * - Monitor
     * - Dropped nonces check 
     * - transfers (also mints)
     * - Deployments
     * Because deployment loop relies heavily on await, it is put last. This seemed to help 
     */
    start = async function () {
        let deploy_balance = await this.checkBalance("deploy");
        let transfer_balance = await this.checkBalance("transfer");
        if(!deploy_balance || !transfer_balance) {
            process.exit();
        }
        this.state.balance = transfer_balance;
        this.state.nonce = await this.web3.eth.getTransactionCount(this.config.wallets.transfer.address);
        let totalPending = await this.web3.eth.getTransactionCount(this.config.wallets.transfer.address, "pending");
        log(`Transfer Wallet Nonce is ${this.state.nonce}`, MONITOR, this.state);
        log(`Total Pending is ${totalPending}`, MONITOR, this.state);
        await this.init(this.config.initialUPs);
        // console.log(state);
        
        if(!this.state.config.deployOnly) {
            this.balanceAndFundLoop();
            this.monitor();
            this.nonceCheck();
            this.runTransfers();    
        }
        this.deployActors();
    }
}

module.exports = UPHammer;