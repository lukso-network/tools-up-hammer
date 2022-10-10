const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const Web3 = require('web3');

let provider = 'https://rpc.l16.lukso.network';

const web3 = new Web3(provider);
let up_address = '0x9294f7d2e22225068e3423389C10390A2C2aAe10';

let up = new web3.eth.Contract(
    UniversalProfile.abi,
    up_address
);
up.methods.owner().call().then(owner => console.log(owner));