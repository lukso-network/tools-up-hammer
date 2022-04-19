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

const OPERATION_CALL = 0;

const web3 = new Web3(provider, process.env.PRIVATE_KEY);
const EOA = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);


const DEPLOY_PROXY = argv.proxies

const lspFactory = new LSPFactory(provider, {
  deployKey: process.env.PRIVATE_KEY, // Private key of the account which will deploy UPs
  chainId: 22, // Chain Id of the network you want to connect to
});
// console.log(lspFactory);

// Deploy LSP3 Account
async function deploy(controller_addresses) {
    if (typeof(controller_addresses) === 'string') {
        controller_addresses = [controller_addresses];
    }
    const up = await lspFactory.LSP3UniversalProfile.deploy(
        {
            controllerAddresses: controller_addresses, // Address which will controll the UP
            lsp3Profile: lsp3Profile,
        },
        {
            ERC725Account: {
                deployProxy: DEPLOY_PROXY,
            },
            UniversalReceiverDelegate: {
                deployProxy: DEPLOY_PROXY,
            },
            KeyManager: {
                deployProxy: DEPLOY_PROXY, 
            }
        }
    );
    console.log(up);
    return up;
}

async function deployLSP7(owner_address) {
    const digitalAsset = await lspFactory.LSP7DigitalAsset.deploy({
        name: "Some LSP7",
        symbol: "TKN",
        controllerAddress: owner_address, // Account which will own the Token Contract
        isNFT: false,
    })
    
    const lsp7 = new web3.eth.Contract(
        LSP7Mintable.abi,
        digitalAsset.LSP7DigitalAsset.address,
        {
            from: EOA.address
        }
    );
    
    return lsp7;
}

//https://docs.lukso.tech/guides/assets/create-lsp7-digital-asset/
async function mint(lsp7, up_address, amount, up) {

    let targetPayload = await lsp7.methods.mint(up_address, amount, false, '0x').encodeABI();
    
    let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp7._address, 0, targetPayload).encodeABI();

    await up.km.methods.execute(abiPayload).send({
        from: EOA.address, 
        gas: 5_000_000,
        gasPrice: '1000000000',
      });

    
    let totalSupply = await lsp7.methods.totalSupply().call()
    console.log(`Minted ${totalSupply} tokens`);
}

async function run() {
    
    let balance = await web3.eth.getBalance(process.env.ADDRESS);
    console.log(`Balance: ${balance}`);
    if (balance === '0') {
        console.log(`Go get some gas for ${process.env.ADDRESS}`);
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
        deployed = await deploy([process.env.ADDRESS]);
        erc725_address = deployed.ERC725Account.address;
        km_address = deployed.KeyManager.address;
    }
    console.log(`[+] ERC725 address is ${erc725_address}`);
    console.log(`[+] KeyManger address: ${km_address}`);
    erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
    km = new web3.eth.Contract(KeyManager.abi, km_address);
    let lsp7 = await deployLSP7(erc725_address);
    console.log(`[+] LSP7 address: ${lsp7._address}`);

    mint(lsp7, erc725_address, 100, {erc725, km});
    
}

// const myUPAddress = myContracts.ERC725Account.address;
// console.log(muUPAddress);
run();