const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7DigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP7DigitalAsset.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
require('dotenv').config();
const Web3 = require('web3');
const ethers = require("ethers");
const yargs = require('yargs');
const crypto = require('crypto');

const mchammer = require('./lib');
const actions = require('./actions');

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

const provider = (argv.network && parseInt(argv.network) === 14) ? L14 : L16; //'http://34.90.30.203:8545'; //; // RPC url used to connect to the network

const web3 = new Web3(provider, process.env.PRIVATE_KEY);
const EOA = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);


const DEPLOY_PROXY = argv.proxies

const lspFactory = new LSPFactory(provider, {
  deployKey: process.env.PRIVATE_KEY, // Private key of the account which will deploy UPs
  chainId: 22, // Chain Id of the network you want to connect to
});

let state = {
    up: {},
    lsp7: {},
    lsp8: {},
    web3,
    lspFactory,
    DEPLOY_PROXY,
    EOA
}

async function initUP(DEPLOY_PROXY) {
    let erc725_address, erc725;
    let km_address, km;
    let up, deployed;
    if(process.env.ERC725_ADDRESS && process.env.KEYMANAGER_ADDRESS && !state.up[process.env.ERC725_ADDRESS]) {
        console.log(`[+] Found UP addresses. Skipping deployments`);
        erc725_address = process.env.ERC725_ADDRESS;
        km_address = process.env.KEYMANAGER_ADDRESS;
    } else if(process.env.ERC725_ADDRESS_B && process.env.KEYMANAGER_ADDRESS_B && !state.up[process.env.ERC725_ADDRESS_B]) {
            console.log(`[+] Found Secondary UP. Skipping deployments`);
            erc725_address = process.env.ERC725_ADDRESS_B;
            km_address = process.env.KEYMANAGER_ADDRESS_B;
    } else {
        console.log(`[+] Deploying Profile`);
        deployed = await mchammer.deploy(lspFactory, [process.env.ADDRESS], DEPLOY_PROXY);
        erc725_address = deployed.ERC725Account.address;
        km_address = deployed.KeyManager.address;
    }
    console.log(`[+] ERC725 address:     ${erc725_address}`);
    console.log(`[+] KeyManager address: ${km_address}`);
    erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
    km = new web3.eth.Contract(KeyManager.abi, km_address);
    state.up[erc725_address] = {
        erc725,
        km
    }
}

async function init(num_to_deploy) {
    for(let i=0; i < num_to_deploy; i++) {
        await initUP(DEPLOY_PROXY);
    }
 
}

const loop_actions = [
    actions.loop_deployUP,
    actions.loop_deployLSP7,
    actions.loop_deployLSP8,
    actions.loop_mintLSP7,
    actions.loop_mintLSP8,
    actions.loop_transferLSP7,
    actions.loop_transferLSP8
]

// empty this if you want purely random operation
const dev_loop = [
    // actions.loop_deployLSP7,
    // actions.loop_mintLSP7,
    // actions.loop_deployLSP8,
    // actions.loop_mintLSP8,
    // actions.loop_transferLSP8
]

async function loop() {
    // predetermined dev loop
    for(let i=0; i< dev_loop.length; i++) {
        await dev_loop[i](state);
    }
    while(true) {
        let next = mchammer.randomIndex(loop_actions); 
        await loop_actions[next](state);
    }
}

async function run() {
    console.log('[+] Checking balance...');
    let balance = await web3.eth.getBalance(process.env.ADDRESS);
    console.log(`[+] Balance: ${balance}`);
    if (balance === '0') {
        console.log(`[!] Go get some gas for ${process.env.ADDRESS}`);
        if(provider === L14) {
            console.log('http://faucet.l14.lukso.network/');    
        } else {
            console.log('http://faucet.11111111.l16.lukso.network/');
        } 
        return;
    }

    await init(argv.numups);
    console.log(state);

    await loop();
    

    // mchammer.mint(lsp7, erc725_address, 100, {erc725, km}, EOA);
    
}

// const myUPAddress = myContracts.ERC725Account.address;
// console.log(muUPAddress);
run();