const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7DigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP7DigitalAsset.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
// require('dotenv').config();
const Web3 = require('web3');
const ethers = require("ethers");
const yargs = require('yargs');
const crypto = require('crypto');
const delay = require('await-delay');

const mchammer = require('./lib');
const actions = require('./actions');
const config = require("./config.json");
const presets = require("./presets.json");
const log = require("./logging").log;
const warn = require("./logging").warn;
const DEBUG = require("./logging").DEBUG;
const VERBOSE = require("./logging").VERBOSE;
const INFO = require("./logging").INFO;
const QUIET = require("./logging").QUIET

var argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 [--noproxies] [--network 14|16] [-u <number of UPs>')
    .boolean(['noproxies'])
    .default('noproxies', true)
    .option('network', {
        alias: 'l',
        description: "l14 or l16 network, defaults to l16",
        default: '16'
        })
    .option('numups', {
        alias: 'u',
        description: "Number of UPs to deploy",
        default: 2
    })
    .argv;


const L16 = 'https://rpc.beta.l16.lukso.network/';
const L14 = 'https://rpc.l14.lukso.network';

const provider = config.provider; // (argv.network && parseInt(argv.network) === 14) ? L14 : L16; //'http://34.90.30.203:8545'; //; // RPC url used to connect to the network
console.log(`[+] Provider is ${provider}`);
// web3 is used for transferring and minting, not deployments
const web3 = new Web3(provider, config.wallets.transfer.privateKey);
const EOA_transfer = web3.eth.accounts.wallet.add(config.wallets.transfer.privateKey);

// EOA is used for deployments
const EOA_deploy = web3.eth.accounts.wallet.add(config.wallets.deploy.privateKey);


const DEPLOY_PROXY = argv.proxies

const lspFactory = new LSPFactory(provider, {
  deployKey: config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
  chainId: config.chainId, // Chain Id of the network you want to connect to
});


config.presets = presets;


let state = {
    up: {},
    lsp7: {
        transferable: false,
        addresses: {}
    },
    lsp8: {
        transferable: false,
        addresses: {}
    },
    nonce: null,
    droppedNonces: [],
    pendingTxs: {},
    txs: [],
    web3,
    lspFactory,
    DEPLOY_PROXY,
    EOA: {
        deploy: EOA_deploy,
        transfer: EOA_transfer
    }
}

web3.eth.subscribe('pendingTransactions', function(error, result){
    if (!error)
        log(result, INFO);
})
.on("data", function(transaction){
    log(`Subscribed pending: ${transaction.hash}`, INFO);
    state.mempoolTxs.push(transaction.hash);
});

async function init(num_to_deploy) {
    for(let i=0; i < num_to_deploy; i++) {
        await mchammer.initUP(state);
    }
 
}

const deploy_actions = [
    actions.loop_deployUP,
    actions.loop_deployLSP7,
    actions.loop_deployLSP8,
]

const transfer_actions = [
    actions.loop_transferLSP7,
    actions.loop_transferAllLSP7,
    actions.loop_transferLSP8,
    actions.loop_mintLSP7,
    actions.loop_mintLSP8,
];

function continueDeployments() {
    let _continue = false;
    if(Object.keys(state.up).length <= config.deployLimits.up
        && Object.keys(state.lsp7.addresses).length <= config.deployLimits.lsp7
        && Object.keys(state.lsp8.addresses).length <= config.deployLimits.lsp8)
    {
        _continue = true;
    }
    return _continue;
}

async function deployActors() {
    for(const action of config.dev_loop) {
        await actions[action](state);
    }
    while(continueDeployments()) {
        let next = mchammer.randomIndex(deploy_actions); 
        try {
            await deploy_actions[next](state);
        } catch (e) {
            warn(`Error during ${deploy_actions[next]}`, INFO);
        }
    }
}

async function runTransfers() {
    while(true) {
        // pick task
        // read let ups = []
        // let tokens = []
        // let nfts =  []
    // check balance
    // call transfer on token, throughb UP and keymanager
    // with you own nonce++
    let next = mchammer.randomIndex(transfer_actions); 
    try {
        transfer_actions[next](state);
    } catch(e) {
        warn(`error during ${transfer_actions[next]}`, INFO);
    }
    
    await delay(crypto.randomInt(config.maxDelay))
    }
}

async function checkPendingTx() {
    
    let pendingNonces = Object.keys(state.pendingTxs);
    for(i in pendingNonces) {
        let nonce = pendingNonces[i]
        // has this nonce been seen enough as pending that it hits the threshold?
        if(state.pendingTxs[nonce] >= config.pendingNonceThreshold) {
            // assume the nonce is dropped and push to dropped nonces
            state.droppedNonces.push(nonce);
            // sort the array so earliest nonce is first
            state.droppedNonces.sort();
            // delete from pending because it will get replayed
            delete state.pendingTxs[nonce];
        } else {
            // otherwise increment we've seen the nonce
            state.pendingTxs[nonce]++;
        }
        
    }

}

async function nonceCheck() {
    
    while(true) {
        checkPendingTx();
        await delay(config.nonceCheckDelay);
    }
}

async function checkBalance(wallet) {
    log(`Checking ${wallet} balance...`, INFO);
    if(config.wallets[wallet] === undefined) {
        warn(`${wallet} wallet is not properly configured`, QUIET);
    }
    let address = config.wallets[wallet].address;
    let balance = await web3.eth.getBalance(address);
    log(`Balance: ${balance}`, INFO);
    if (balance === '0') {
        warn(`[!] Go get some gas for ${config.wallets[wallet].address}`);
        if(provider === L14) {
            warn('http://faucet.l14.lukso.network/', INFO);    
        } else {
            warn('http://faucet.11111111.l16.lukso.network/', INFO);
        } 
        return false;
    }
    return true;
}

async function start() {
    let deploy_balance = await checkBalance("deploy");
    let transfer_balance = await checkBalance("transfer");
    if(!deploy_balance || !transfer_balance) {
        process.exit();
    }
    
    state.nonce = await web3.eth.getTransactionCount(config.wallets.transfer.address, "pending");
    log(`[+] Transfer Wallet Nonce is ${state.nonce}`, INFO);
    await init(config.initialUPs);
    console.log(state);
    
    nonceCheck();
    runTransfers();
    deployActors();
    
    
}

start();