#!/usr/bin/env node
const fs = require("fs");
const Web3 = require("web3");
const config = require("../src/config.json");
const { 
    createProfile,
    fundProfiles
 } = require("../src/helpers");

const web3 = new Web3(config.provider);

const profilesDir = "profiles";
const presetsDir = "presets";

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
        let profile = await createProfile(i, profilesDir, presetsDir);
        profiles.push(profile);
    }

    await fundProfiles(funder, profiles, amountToFund);
}

main();
