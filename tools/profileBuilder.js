#!/usr/bin/env node
const fs = require("fs");
const Web3 = require("web3");
const config = require("../src/config.json");
const { fundSingleAccount } = require("../src/helpers");

const web3 = new Web3(config.provider);

const profilesDir = "profiles";
const presetsDir = "presets";


async function createProfile(i) {
    try {
        // if there is already a profile file, check if it has a `locked` property set
        // if it is `locked`, then simply return that profile, do not create a new one
        let profileData = await fs.readFileSync(`./${profilesDir}/profile${i}.json`);
        let profile = JSON.parse(profileData);
        if (profile.locked) {
            console.log(`[+] Preserving profile ${i}`)
            return profile;
        }
    } catch (e) {}
    

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

    configJS = JSON.stringify(config, null, 4);
    await fs.writeFileSync(`./${profilesDir}/profile${i}.json`, configJS);
    console.log(`[+] Saving new profile ${i}`);
    return config;
}



async function fundProfiles(funder, presets, amountToFund) {
    if(!amountToFund) {
        // will fund using the entire balance
        amountToFund = await web3.eth.getBalance(funder.address);
        if (amountToFund === "0" ) {
            console.log(`[!] Funding account balance is 0`);
            process.exit();
        }
    }
    // each item in presets is TX + Deploy keys, so multiply by 2
    // then add an extra slot for account for gas
    let numRecipients = (presets.length * 2) + 1
    let amountPerRecipient = Math.floor(amountToFund / numRecipients);
    console.log(`[+] Distributing ${amountPerRecipient} amongst ${numRecipients-1}`);

    recipients = presets.flatMap((w) => [w.wallets.transfer.address, w.wallets.deploy.address])
    for(i in recipients) {
        let failed = await fundSingleAccount (funder, recipients[i], amountPerRecipient, web3);
        if (failed) {
            recipients.push(failed);
        }
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

    let profiles = [];

    let funder = web3.eth.accounts.privateKeyToAccount(privateKey);
    console.log(`[+] Funding from ${funder.address}`)

    for(let i=1; i<=numberOfAccounts; i++) {
        let profile = await createProfile(i);
        profiles.push(profile);
    }

    await fundProfiles(funder, profiles, amountToFund);
}

main();
