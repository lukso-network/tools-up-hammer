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



let state = {
    up: {},
    lsp7: {},
    lsp8: {},
    nonce: null,
    droppedNonces: [],
    pendingTxs: [],
    txs: [],
    web3,
    lspFactory,
    DEPLOY_PROXY,
    EOA: {
        deploy: EOA_deploy,
        transfer: EOA_transfer
    }
}



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

async function loop() { 
    console.log("[+] Entering endless loop");
    while(true) {

    }
}

async function deployActors() {
    for(const action of config.dev_loop) {
        await actions[action](state);
    }
    while(true) {
        let next = mchammer.randomIndex(deploy_actions); 
        await deploy_actions[next](state);
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
    transfer_actions[next](state);
    await delay(crypto.randomInt(config.maxDelay))
    }
}

async function checkPendingTx() {
    for(pendingTx in state.pendingTxs) {
      const tx = web3.eth.getPendingTransacitons(pendingTx.hash)
      if(!tx)
        state.droppedNonces.push(pendingTx.nonce)
    }
}

async function checkBalance(wallet) {
    console.log(`[+] Checking ${wallet} balance...`);
    if(config.wallets[wallet] === undefined) {
        console.log(`[!] ${wallet} wallet is not properly configured`);
    }
    let address = config.wallets[wallet].address;
    let balance = await web3.eth.getBalance(address);
    console.log(`[+] Balance: ${balance}`);
    if (balance === '0') {
        console.log(`[!] Go get some gas for ${config.wallets[wallet].address}`);
        if(provider === L14) {
            console.log('http://faucet.l14.lukso.network/');    
        } else {
            console.log('http://faucet.11111111.l16.lukso.network/');
        } 
        return false;
    }
    return true;
}

async function start() {
    let deploy_balance = await checkBalance("deploy");
    let transfer_balance = await checkBalance("transfer");
    if(!deploy_balance || !transfer_balance) {
        exit();
    }
    
    state.nonce = await web3.eth.getTransactionCount(config.wallets.transfer.address, "pending");
    console.log(`[+] Transfer Wallet Nonce is ${state.nonce}`);
    await init(config.initialUPs);
    console.log(state);
    
    
    runTransfers();
    deployActors();

    // loop();
    
}

start();