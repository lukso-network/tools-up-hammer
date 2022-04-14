const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
require('dotenv').config();
const Web3 = require('web3');

const provider = 'https://rpc.l14.lukso.network'; // RPC url used to connect to the network

const web3 = new Web3(provider);


const lspFactory = new LSPFactory(provider, {
  deployKey: process.env.PRIVATE_KEY, // Private key of the account which will deploy UPs
  chainId: 22, // Chain Id of the network you want to connect to
});
// console.log(lspFactory);

// Deploy LSP3 Account
async function deploy() {
    const myContracts = await lspFactory.LSP3UniversalProfile.deploy({
        controllerAddresses: ['0x...'], // Address which will controll the UP
        lsp3Profile: {
          json: {
            LSP3Profile: {
              name: "My Universal Profile",
              description: "My cool Universal Profile",
              profileImage: [
                {
                  width: 500,
                  height: 500,
                  hashFunction: "keccak256(bytes)",
                  // bytes32 hex string of the image hash
                  hash: "0xfdafad027ecfe57eb4ad047b938805d1dec209d6e9f960fc320d7b9b11cbed14",
                  url: "ipfs://QmPLqMFHxiUgYAom3Zg4SiwoxDaFcZpHXpCmiDzxrtjSGp",
                },
              ],
              backgroundImage: [
                {
                  width: 500,
                  height: 500,
                  hashFunction: "keccak256(bytes)",
                  // bytes32 hex string of the image hash
                  hash: "0xfdafad027ecfe57eb4ad047b938805d1dec209d6e9f960fc320d7b9b11cbed14",
                  url: "ipfs://QmPLqMFHxiUgYAom3Zg4SiwoxDaFcZpHXpCmiDzxrtjSGp",
                },
              ],
              tags: ['Fashion', 'Design'],
              links: [{ title: "My Website", url: "www.my-website.com" }],
            },
          },
          url: "",
        },
      });
}

async function run() {
    let balance = await web3.eth.getBalance(process.env.ADDRESS);
    console.log(`Balance: ${balance}`);
    if (balance === '0') {
        console.log('Go get some gas');
        return;
    }
}

// const myUPAddress = myContracts.ERC725Account.address;
// console.log(muUPAddress);
run();