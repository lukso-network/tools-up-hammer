const fs = require("fs");

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

function getAddresses(profiles) {
    let addresses = profiles.flatMap((w) => [w.wallets.transfer.address, w.wallets.deploy.address])
    return addresses;
}

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

module.exports = {
    getProfiles,
    getAddresses,
    fundSingleAccount
}