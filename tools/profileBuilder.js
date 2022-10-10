#!/usr/bin/env node
const fs = require("fs");
const Web3 = require("web3");
const config = require("../config.json");

const web3 = new Web3(config.provider);

const profilesDir = "UPprofiles";
const presetsDir = "UPpresets";


async function createProfile(i) {
    let deployAccount = web3.eth.accounts.create();
    let transferAccount = web3.eth.accounts.create();

    let config = {
        wallets: {
            transfer: {
                address: transferAccount.address,
                privateKey: transferAccount.privateKey
            },
            deploy: {
                address: deployAccount.address,
                privateKey: deployAccount.privateKey
            }
        },
        presetsFile: `./${presetsDir}/presets${i}.json`,
    }

    configJS = JSON.stringify(config);
    await fs.writeFileSync(`./${profilesDir}/profile${i}.json`, configJS);
    return config;
}

async function fundSingleAccount(funder, recipient, amount) {
    const nonce = await web3.eth.getTransactionCount(funder.address); 

    const transaction = {
     'to': recipient, 
     'value': amount,
     'gas': 30000,
    // //  'maxFeePerGas': 1000000108,
     'nonce': nonce,
    };
   
    const signedTx = await web3.eth.accounts.signTransaction(transaction, funder.privateKey);
    
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(error, hash) {
        if (!error) {
            console.log(`TX ${hash}`);
        } else {
            console.log("Error", error)
        }
   });
}

async function fundPresets(funder, presets, amountToFund) {
    if(!amountToFund) {
        // will fund using the entire balance
        amountToFund = await web3.eth.getBalance(funder.address);
        if (amountToFund === "0" ) {
            console.log(`Funding account balance is 0`);
            process.exit();
        }
    }
    // each item in presets is TX + Deploy keys, so multiply by 2
    // then add an extra slot for account for gas
    let numRecipients = (presets.length * 2) + 1
    let amountPerRecipient = Math.floor(amountToFund / numRecipients);
    console.log(`Distributing ${amountPerRecipient} amongst ${numRecipients}`);

    recipients = presets.flatMap((w) => [w.wallets.transfer.address, w.wallets.deploy.address])
    for(i in recipients) {
        await fundSingleAccount (funder, recipients[i], amountPerRecipient);
    }
}

async function main() {
    let [,, ...args] = process.argv;

    if (args.length < 2) {
        console.log(`Usage: ${process.argv} <private key> <number accounts> [amount to fund]`)
        process.exit();
    }

    let privateKey = args[0];
    let numberOfAccounts = parseInt(args[1]);
    let amountToFund = args[2] ? args[2] : undefined;

    let presets = [];

    let funder = web3.eth.accounts.privateKeyToAccount(privateKey);

    for(let i=0; i<numberOfAccounts; i++) {
        let preset = await createProfile(i);
        presets.push(preset);
    }

    await fundPresets(funder, presets, amountToFund);
}

main();