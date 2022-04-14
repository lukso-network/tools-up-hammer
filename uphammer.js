const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
require('dotenv').config();
const Web3 = require('web3');
const yargs = require('yargs');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;

var argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 [--proxies]')
    .boolean(['proxies'])
    .default('proxies', false)
    .argv;

const provider = 'https://rpc.l14.lukso.network'; // RPC url used to connect to the network

const web3 = new Web3(provider);

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
}

async function run() {
    let balance = await web3.eth.getBalance(process.env.ADDRESS);
    console.log(`Balance: ${balance}`);
    if (balance === '0') {
        console.log('Go get some gas');
        return;
    }
    deploy([process.env.ADDRESS]);
}

// const myUPAddress = myContracts.ERC725Account.address;
// console.log(muUPAddress);
run();