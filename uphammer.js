const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;

const Web3 = require('web3');

const crypto = require('crypto');
const delay = require('await-delay');

const {initUP, randomIndex } = require('./lib');
const actions = require('./actions');
const config = require("./config.json");
const utils = require("./utils");

const {log, warn, DEBUG, VERBOSE, INFO, QUIET} = require('./logging');

let {state} = require("./state");

// we need to override _onHttpRequestError to get network failure information
const XHR = require('xhr2-cookies').XMLHttpRequest
XHR.prototype._onHttpRequestError = function (request, error) {
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

    constructor(user_config, user_presets) {
        // merge config
        this.config = config;
        this.mergeConfig(user_config);

        this.provider = this.config.provider; 
        log(`Provider is ${this.provider}`, INFO);
        log(`ChainId is ${this.config.chainId}`, INFO);
        // web3 is used for transferring and minting, not deployments
        this.web3 = new Web3(this.provider, this.config.wallets.transfer.privateKey);
        const EOA_transfer = this.web3.eth.accounts.wallet.add(this.config.wallets.transfer.privateKey);
        
        // deploy key is used for deployments
        const EOA_deploy = this.web3.eth.accounts.wallet.add(this.config.wallets.deploy.privateKey);
        
        
        const DEPLOY_PROXY = this.config.deployProxy;
        
        this.lspFactory = new LSPFactory(this.provider, {
          deployKey: this.config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
          chainId: this.config.chainId, // Chain Id of the network you want to connect to
        });
        
        // store presets in config if they are preset
        this.config.presets = user_presets ? user_presets : {};
        
        state = {...state,
            web3: this.web3,
            lspFactory: this.lspFactory,
            DEPLOY_PROXY,
            EOA: {
                deploy: EOA_deploy,
                transfer: EOA_transfer
            },
            config: this.config,
        };
    }

    mergeConfig = function(user_config) {
        for(let setting in user_config) {
            this.config[setting] = user_config[setting];
        }
    }

    init = async function(num_to_deploy) {
        for(let i=0; i < num_to_deploy; i++) {
            await initUP(state);
        }
     
    }

    continueDeployments = function () {
        let _continue = false;
        if(Object.keys(state.up).length <= this.config.deployLimits.up
            && Object.keys(state.lsp7.addresses).length <= this.config.deployLimits.lsp7
            && Object.keys(state.lsp8.addresses).length <= this.config.deployLimits.lsp8)
        {
            _continue = true;
        }
        return _continue;
    }

    deployActors = async function () {
        // wait until there are UPs loaded into state
        while(Object.keys(state.up).length === 0) {
            await delay(1000);
        }
        // run custom defined dev_loop
        for(const action of this.config.dev_loop) {
            // deployReactive set to true complicates the loop significantly.
            // it really should be removed.
            // if we deployReactively, we need to wait until deployment has finished before
            // we can deploy again, otherwise we'll have nonce issues
            if(this.config.deployReactive) {
                while(state.deploying) {
                    await delay(this.config.deploymentDelay);
                }
            }

            state.deploying = true;
            await actions[action](state);
            
        }
        // the main deploy loop. Deploys up to the limits set in the config
        while(this.continueDeployments()) {
            let next = randomIndex(this.deploy_actions); 
            try {
                await this.deploy_actions[next](state);
                await delay(this.config.deploymentDelay);
            } catch (e) {
                warn(`Error during ${this.deploy_actions[next].name}`, INFO);
                console.log(e);
            }
        }
        log('Finished deployments', INFO);
    }

    /***
     * This is the main loop for transfers. It runs at an interval set in config as maxDelay
     * A random index is selected from the `transfer_actions` array
     */
    runTransfers = async function () {
        while(true) {

            let next = randomIndex(this.transfer_actions); 
            try {
                if(Object.keys(state.up).length > 0) { 
                    this.transfer_actions[next](state);    
                }
            } catch(e) {
                warn(`error during ${this.transfer_actions[next].name}`, INFO);
            }

            // calculate the delay
            let timeToDelay;
            // crypto.randomInt cannot handle floats, so only select randomly if we are at 1 or above
            if(this.config.maxDelay >= 1) {
                timeToDelay = crypto.randomInt(this.config.maxDelay) + state.backoff;
            } else if(this.config.maxDelay > 0) {
                // if we are between 0 and 1, just use Math.random
                timeToDelay = Math.random(this.config.maxDelay) + state.backoff;
            } else {
                timeToDelay = 0 + state.backoff;
            }
            
            // apply backoff if it exists for this cycle
            state.backoff > 0 ? state.backoff-- : state.backoff = 0;
            state.monitor.tx.loop++;
            await delay(timeToDelay);
        }
    }

    /**
     * This function iterates through state.pendingTxs and looks up the txhashes found there.
     * The state.pendingTxs array stores objects of type {hash, nonce}
     * If no TX is found for that hash, the nonce is added to the state.droppedNonces array if it doesn't already exist
     */
    checkPendingTx = async function () {
        // let txsToRemove = [];
        let hashes = Object.keys(state.pendingTxs);
        for(let i=0; i<hashes.length; i++) {
            let hash = hashes[i];
            // if we do this with promises, then the indexes get messed up when transactions are removed
            // from the array asynchronously
            // so using await unless a better solution can be found.
            // this runs in its own thread though, so *SHOULDN'T* affect the transfers
            try {
                let tx = await this.web3.eth.getTransaction(hash);
                if(!tx) {
                    // tx is dropped
                    utils.addNonceToDroppedNoncesIfNotPresent(state, state.pendingTxs[hash].nonce);
                    // txsToRemove.push(i);
                    delete state.pendingTxs[hash];
                } else if(tx.blockNumber) {
                    // tx is mined
                    // txsToRemove.push(i);
                    delete state.pendingTxs[hash];
                }
            } catch(e) {
                console.log(e);
            }

        }
        // remove the indices after the entire pendingTxs array has been gone through
        // for(let j=0; j<txsToRemove.length;j++) {
        //     log(`===== To Remove ${state.pendingTxs[j].nonce}`, QUIET);
        //     state.pendingTxs.splice(txsToRemove[j], 1);
        //     if(!state.pendingTxs[j] && state.pendingTxs.length > 0) {
        //         console.log(state.pendingTxs[j]);
        //     } else {
        //         log(`===== IS not the same? ${state.pendingTxs[j].nonce}`, QUIET);
        //     }
            
            
        // }
    
    }

    /**
     * The loop that checks for dropped nonces. The `nonceCheckDelay` parameter in the config controls how often this is run
     */
    nonceCheck = async function () {
    
        while(true) {
            // checkPendingTx needs to complete before running a second time
            // otherwise the next run will have smaller indices than the first
            await this.checkPendingTx();
            await delay(config.nonceCheckDelay);
        }
    }

    /**
     * Checks the balances of both deploy and transfer accounts and aborts if both are not funded
     */
    checkBalance = async function (wallet) {
        log(`Checking ${wallet} balance...`, QUIET);
        if(this.config.wallets[wallet] === undefined) {
            warn(`${wallet} wallet is not properly configured`, QUIET);
        }
        let address = this.config.wallets[wallet].address;
        let balance = await this.web3.eth.getBalance(address);
        log(`Balance: ${balance}`, QUIET);
        if (balance === '0') {
            warn(`[!] Go get some gas for ${this.config.wallets[wallet].address}`, QUIET);
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
            utils.monitorCycle(state);
        }
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
        
        state.nonce = await this.web3.eth.getTransactionCount(this.config.wallets.transfer.address);
        log(`Transfer Wallet Nonce is ${state.nonce}`, INFO);
        await this.init(this.config.initialUPs);
        // console.log(state);
        
        if(!state.config.deployOnly) {
            this.monitor();
            this.nonceCheck();
            this.runTransfers();    
        }
        this.deployActors();
    }
}

module.exports = UPHammer;