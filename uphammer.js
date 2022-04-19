const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7DigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP7DigitalAsset.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
require('dotenv').config();
const Web3 = require('web3');
const ethers = require("ethers");
const yargs = require('yargs');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;
const mchammer = require('./lib');

var argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 [--noproxies] [--network 14|16]')
    .boolean(['noproxies'])
    .default('noproxies', true)
    .option('network', {
        alias: 'n',
        description: "l14 or l16 network, defaults to l16",
        default: '16'
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
// console.log(lspFactory);



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
    let erc725_address, erc725;
    let km_address, km;
    let up, deployed;
    if(process.env.ERC725_ADDRESS && process.env.KEYMANAGER_ADDRESS) {
        console.log(`[+] Found UP addresses. Skipping deployments`);
        erc725_address = process.env.ERC725_ADDRESS;
        km_address = process.env.KEYMANAGER_ADDRESS;
    } else {
        console.log(`[+] Deploying Profile`);
        deployed = await mchammer.deploy(lspFactory, [process.env.ADDRESS]);
        erc725_address = deployed.ERC725Account.address;
        km_address = deployed.KeyManager.address;
    }
    console.log(`[+] ERC725 address:     ${erc725_address}`);
    console.log(`[+] KeyManager address: ${km_address}`);
    erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
    km = new web3.eth.Contract(KeyManager.abi, km_address);
    let lsp7 = await mchammer.deployLSP7(lspFactory, web3, erc725_address, EOA);
    console.log(`[+] LSP7 address:       ${lsp7._address}`);

    mchammer.mint(lsp7, erc725_address, 100, {erc725, km}, EOA);
    
}

// const myUPAddress = myContracts.ERC725Account.address;
// console.log(muUPAddress);
run();