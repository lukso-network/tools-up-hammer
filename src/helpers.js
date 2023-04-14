const fs = require("fs");

/**
 * Returns all the profiles found in the provided profile directory
 * @param {*} profileDir 
 */
function getProfiles(profileDir) {
    let profiles = [];
    let files = fs.readdirSync(profileDir);
    for(f in files) {
        let data = fs.readFileSync(`${profileDir}${files[f]}`);
        let profile = JSON.parse(data);
        profiles.push(profile);
    }
    return profiles;

}

/**
 * Returns the addresses for all the deploy and transfer wallets from an array of profiles
 * @param {*} profiles 
 */
function getAddresses(profiles) {
    let addresses = profiles.flatMap((w) => [w.wallets.transfer.address, w.wallets.deploy.address])
    return addresses;
}

/**
 * Funds an address
 * @param {*} funder 
 * @param {*} recipient 
 * @param {*} amount 
 * @param {*} web3 
 */
async function fundSingleAccount(funder, recipient, amount, web3) {
    const nonce = await web3.eth.getTransactionCount(funder.address); 

    const transaction = {
     'to': recipient, 
     'value': amount,
     'gas': 30000,
     'nonce': nonce,
    };
   
    const signedTx = await web3.eth.accounts.signTransaction(transaction, funder.privateKey);
    try {
        await web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(error, hash) {
            if (!error) {
                console.log(`[+] Funded ${recipient} ${amount}`);
            } else {
                console.log("[!] Error", error)
            }
       });
    } catch(e) {
        console.log(`[!] Error ${e}`)
        return recipient
    }
    
}

/**
 * Creates a profile's config.json file
 * By default this is destructive. It will overwrite whatever profile currently exists
 * If a profile has `locked`: true in the config, then this function will not overwrite it
 * @param {*} i 
 * @param {*} profilesDir 
 * @param {*} presetsDir 
 */
async function createProfile(i, profilesDir, presetsDir, web3) {
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

/**
 * Funds all profiles provided.
 * @param {*} funder - an EOA
 * @param {*} profiles - an array of profile configs
 * @param {*} amountToFund - option. If absent, the full balance of funder is used
 */
async function fundProfiles(funder, profiles, amountToFund, web3) {
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
    let numRecipients = (profiles.length * 2) + 1
    let amountPerRecipient = Math.floor(amountToFund / numRecipients);
    console.log(`[+] Distributing ${amountPerRecipient} amongst ${numRecipients-1}`);

    recipients = profiles.flatMap((w) => [w.wallets.transfer.address, w.wallets.deploy.address])
    for(i in recipients) {
        let failed = await fundSingleAccount (funder, recipients[i], amountPerRecipient, web3);
        if (failed) {
            recipients.push(failed);
        }
    }
}

module.exports = {
    getProfiles,
    getAddresses,
    fundSingleAccount,
    createProfile,
    fundProfiles
}