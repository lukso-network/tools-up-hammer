const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;

const Web3 = require('web3');

const crypto = require('crypto');
const delay = require('await-delay');

const mchammer = require('./lib');
const actions = require('./actions');
const config = require("./config.json");
const utils = require("./utils");
const presets = require("./presets.json");
const {log, warn, monitor, DEBUG, VERBOSE, INFO, QUIET} = require('./logging');

let {state} = require("./state");

const XHR = require('xhr2-cookies').XMLHttpRequest
XHR.prototype._onHttpRequestError = function (request, error) {
  if (this._request !== request) {
      return;
  }
  // A new line
  
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

    deploy_actions = [
        actions.loop_deployUP,
        actions.loop_deployLSP7,
        actions.loop_deployLSP8,
    ]
    
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
        
        // EOA is used for deployments
        const EOA_deploy = this.web3.eth.accounts.wallet.add(this.config.wallets.deploy.privateKey);
        
        
        const DEPLOY_PROXY = this.config.deployProxy;
        
        this.lspFactory = new LSPFactory(this.provider, {
          deployKey: this.config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
          chainId: this.config.chainId, // Chain Id of the network you want to connect to
        });
        
        
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
            await mchammer.initUP(state);
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
        while(Object.keys(state.up).length === 0) {
            await delay(1000);
        }
        for(const action of this.config.dev_loop) {
            if(this.config.deployReactive) {
                while(state.deploying) {
                    await delay(this.config.deploymentDelay);
                }
            }

            state.deploying = true;
            await actions[action](state);
            
        }
        while(this.continueDeployments()) {
            let next = mchammer.randomIndex(this.deploy_actions); 
            try {
                await this.deploy_actions[next](state);
                await delay(this.config.deploymentDelay);
            } catch (e) {
                warn(`Error during ${this.deploy_actions[next].name}`, INFO);
                console.log(e);
            }
        }
    }

    runTransfers = async function () {
        while(true) {

            let next = mchammer.randomIndex(this.transfer_actions); 
            try {
                if(Object.keys(state.up).length > 0) { 
                    this.transfer_actions[next](state);    
                }
                
            } catch(e) {
                warn(`error during ${this.transfer_actions[next].name}`, INFO);
            }
            let timeToDelay = crypto.randomInt(this.config.maxDelay) + state.backoff;
            state.backoff > 0 ? state.backoff-- : state.backoff = 0;

            await delay(timeToDelay);
        }
    }

    checkPendingTx = async function () {
        let txsToRemove = [];
        for(let i=0; i<state.pendingTxs.length; i++) {
            // we do this with promises, then the indexes get messed up when transactions are removed
            // from the array asynchronously
            // so using await unless a better solution came be found.
            // this runs in its own thread though, so won't affect the transfers
            try {
                let tx = await this.web3.eth.getTransaction(state.pendingTxs[i].hash);
                if(!tx) {
                    // tx is dropped
                    utils.addNonceToDroppedNoncesIfNotPresent(state, state.pendingTxs[i].nonce);
                    txsToRemove.push(i);
                } else if(tx.blockNumber) {
                    // tx is mined
                    txsToRemove.push(i);
                }
            } catch(e) {
                console.log(e);
            }

        }
        // remove the indices after the entire pendingTxs array has been gone through
        for(let j=0; j<txsToRemove.length;j++) {
            state.pendingTxs.splice(txsToRemove[j], 1);
        }
    
    }

    nonceCheck = async function () {
    
        while(true) {
            // checkPendingTx needs to complete before running a second time
            // otherwise the next run will have smaller indices than the first
            await this.checkPendingTx();
            await delay(config.nonceCheckDelay);
        }
    }

    checkBalance = async function (wallet) {
        log(`Checking ${wallet} balance...`, INFO);
        if(this.config.wallets[wallet] === undefined) {
            warn(`${wallet} wallet is not properly configured`, QUIET);
        }
        let address = this.config.wallets[wallet].address;
        let balance = await this.web3.eth.getBalance(address);
        log(`Balance: ${balance}`, INFO);
        if (balance === '0') {
            warn(`[!] Go get some gas for ${this.config.wallets[wallet].address}`);
            // if(provider === L14) {
            //     warn('http://faucet.l14.lukso.network/', INFO);    
            // } else {
            //     warn('http://faucet.11111111.l16.lukso.network/', INFO);
            // } 
            return false;
        }
        return true;
    }

    monitor = async function() {
        while(true) {
            await delay(this.config.monitorDelay);
            utils.monitorCycle(state);
        }
    }
    
    start = async function () {
        let deploy_balance = await this.checkBalance("deploy");
        let transfer_balance = await this.checkBalance("transfer");
        if(!deploy_balance || !transfer_balance) {
            process.exit();
        }
        
        state.nonce = await this.web3.eth.getTransactionCount(this.config.wallets.transfer.address);
        log(`[+] Transfer Wallet Nonce is ${state.nonce}`, INFO);
        await this.init(this.config.initialUPs);
        // console.log(state);
        
        this.monitor();
        this.nonceCheck();
        this.runTransfers();
        this.deployActors();
    }
}

module.exports = UPHammer;