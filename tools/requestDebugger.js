const fs = require("fs");
const Web3 = require('web3');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');

const config = require('../src/config.json');
const utils = require('../src/utils');

const OPERATION_CALL = 0;

let provider = config.provider;

const web3 = new Web3(provider);

async function mint(lsp, up, amt_or_id, EOA, nonce, gasPrice, profileNum, sender ) {
    try {
        let targetPayload = await lsp.methods.mint(up.erc725._address, amt_or_id, false, '0x').encodeABI();
        console.log(targetPayload);
        let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

        console.log(`[+] (${profileNum}) Minting more LSP7 (${nonce})`);

        let start = new Date();
        console.log(`Start ${start.toISOString()}`);
        up.km.methods.execute(abiPayload).send({
            from: sender, 
            gas: 5_000_001,
            gasPrice,
            nonce
        })
        .on('transactionHash', function(hash){
            console.log(`[+] (${profileNum}) Tx: ${hash} Nonce: ${nonce}`);
        })
        .on('receipt', function(receipt){
            console.log(`Minted tokens (${profileNum}) ${receipt.transactionHash} to ${lsp._address} Nonce ${nonce} `);      
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            let end = new Date();
            console.log(`End ${end.toISOString()}`);
            console.warn(`[!] (${profileNum}) Minting Error. Nonce ${nonce} GasPrice ${gasPrice}`);
            console.log(error)
        });
        
    } catch(e) {
        console.warn(`(${profileNum}) Error during minting. Nonce ${nonce} GasPrice ${gasPrice}`);
        // console.log(e);
        console.log(e);
    }
}

async function basicMint(up, lsp7, sender) {
    console.log(`LSP ${lsp7._address}`)
    console.log(`ERC ${up.erc725._address}`)
    const myToken = new web3.eth.Contract(LSP7Mintable.abi, lsp7._address);

    let res = await myToken.methods.mint(up.erc725._address, 100, false, '0x')
    .send({ from: sender,
            gas: 5_000_000,
            gasPrice: config.defaultGasPrice
     });
    console.log(res);
}

async function singleTx(profileNum) {
    let rawProfile = await fs.readFileSync(`./profiles/profile${profileNum}.json`);
    let rawPresets = await fs.readFileSync(`./presets/presets${profileNum}.json`);
    let profile = JSON.parse(rawProfile);
    let presets = JSON.parse(rawPresets);
    let EOA = profile.wallets;
    
    let wallet = EOA.deploy;

    let privateKey = wallet.privateKey;
    let address = wallet.address;
    console.log(privateKey);

    balance = await web3.eth.getBalance(address);
    console.log(balance);
    web3.eth.accounts.wallet.add(privateKey);

    console.log(`[+] (${profileNum}) Transfer address is ${address}`)
    let nonce = await web3.eth.getTransactionCount(address);
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
    // gasPrice = parseInt(gasPrice) + 10;

    await mint(lsp7, up, 1, EOA, nonce, gasPrice, profileNum, address);
    // await basicMint(up, lsp7, address);
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

function main() {
    let [,, ...args] = process.argv;

    if (args.length < 1) {
        console.log(`Usage: ${process.argv[1]} <profile-number>`);
        console.log(`Usage: ${process.argv[1]} <profile start> <profile end>`);
        process.exit();
    }

    if(args.length === 1) {
        let profileNumber = parseInt(args[0]);
        singleTx(profileNumber);
    } else {
        let start = parseInt(args[0]);
        let end = parseInt(args[1]);
        debugAll([start, end]);
    }
}

main();