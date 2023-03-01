const fs = require("fs");
const Web3 = require('web3');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');

const config = require('../config.json');
const utils = require('../utils');

const OPERATION_CALL = 0;

const web3 = new Web3(config.provider);

let replayed = false;
let incremented = false;

async function mint(lsp, up, amt_or_id, EOA, nonce, gasPrice, profileNum ) {
    try {
        let targetPayload = await lsp.methods.mint(up.erc725._address, amt_or_id, false, '0x').encodeABI();
        
        let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

        console.log(`[+] (${profileNum}) Minting more LSP7 (${nonce})`);

        up.km.methods.execute(abiPayload).send({
            from: EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice,
            nonce
        })
        .on('transactionHash', function(hash){
            console.log(`[+] (${profileNum}) Tx: ${hash} Nonce: ${nonce}`);
            // if(!replayed) {
            //     replayed = true;
            //     amt_or_id++;
            //     mint(lsp, up, amt_or_id, EOA, nonce, gasPrice);
            // }
            // if(!incremented) {
            //     nonce++;
            //     incremented = true;
            //     mint(lsp, up, amt_or_id, EOA, nonce, gasPrice);
            // }
        })
        .on('receipt', function(receipt){
            console.log(`Minted tokens (${profileNum}) ${receipt.transactionHash} to ${lsp._address} Nonce ${nonce} `);
            
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            console.warn(`[!] (${profileNum}) Minting Error. Nonce ${nonce} GasPrice ${gasPrice}`);
            console.log(error)
        });
        
    } catch(e) {
        console.warn(`(${profileNum}) Error during minting. Nonce ${nonce} GasPrice ${gasPrice}`);
        // console.log(e);
        console.log(e);
    }
}

async function singleTx(profileNum) {
    let rawProfile = await fs.readFileSync(`./profiles/profile${profileNum}.json`);
    let rawPresets = await fs.readFileSync(`./presets/presets${profileNum}.json`);
    let profile = JSON.parse(rawProfile);
    let presets = JSON.parse(rawPresets);
    let EOA = profile.wallets;
    

    // let balance = await web3.eth.getBalance("0xa69eb1dc130fdf0d33a6f64e6fb4bb0562162b0a");
    
    // console.log(balance);
    // balance = await web3.eth.getBalance("0xff50407857a06a5163007c58304e3f0446cdc837");
    // console.log(balance);
    // balance = await web3.eth.getBalance("0x79b18703141c09d19fa78fdd1d24a0a757a1e66b");
    // console.log(balance);
    
    web3.eth.accounts.wallet.add(EOA.transfer.privateKey);

    console.log(`[+] (${profileNum}) Transfer address is ${EOA.transfer.address}`)
    let nonce = await web3.eth.getTransactionCount(EOA.transfer.address);
    console.log(`[+] (${profileNum}) Nonce is ${nonce}`);

    let lsp7_address= presets[EOA.deploy.address]['lsp7'][0];
    let lsp7 = new web3.eth.Contract(LSP7Mintable.abi, lsp7_address);
    let owner = await lsp7.methods.owner().call();
    console.log(`[+] (${profileNum}) Owner ${owner}`);

    let up_address, km_address;
    
    for(let i=0; i< presets[EOA.deploy.address]['up'].length; i++) {
        if(owner === presets[EOA.deploy.address]['up'][i]["ERC725_ADDRESS"]) {
            up_address = presets[EOA.deploy.address]['up'][i]["ERC725_ADDRESS"];
            km_address = presets[EOA.deploy.address]['up'][i]["KEYMANAGER_ADDRESS"];
            console.log(`[+] (${profileNum}) LSP7 address ${lsp7_address}`);
            console.log(`[+] (${profileNum}) UP   address ${up_address}`);
            break;
        }
        
    }
    
    
    let erc725 = new web3.eth.Contract(UniversalProfile.abi, up_address);
    let km = new web3.eth.Contract(KeyManager.abi, km_address);
    let up = {
        erc725,
        km
    };

    let gasPrice = config.defaultGasPrice;
    gasPrice = parseInt(gasPrice) + parseInt(gasPrice);
    // gasPrice = parseInt(gasPrice) + 1;

    await mint(lsp7, up, 1, EOA, nonce, gasPrice, profileNum);
}

function debugAll(numProfiles) {
    let start = 1;
    let end = numProfiles;
    if(Array.isArray(numProfiles)) {
        start = numProfiles[0];
        end = numProfiles[1];
    }
    for(let i=start; i<=end; i++) {
        singleTx(i);
    }
}

singleTx(4);
// debugAll([26,30]);