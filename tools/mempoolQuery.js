const Web3 = require("web3");
const axios = require('axios');
const fs = require("fs");

const config = require("../config.json");
const {getAddresses, getProfiles} = require("../helpers");

const web3 = new Web3(config.provider);
console.log(config.provider);
const profileDir = "./profiles/";

//  curl --data '{"method":"txpool_content","id":1,"jsonrpc":"2.0"}' 
// -H "Content-Type: application/json" -X POST "https://rpc.2022.l16.lukso.network"

function queryMempool(provider, address) {
    let data = {"method":"txpool_content","id":1,"jsonrpc":"2.0"};
    axios.post(provider, data)
    .then(res => {
        // console.log(res)
        let pending = res.data.result.pending[address];
        let queued =  res.data.result.queued[address];
        if (queued && queued.length) {
            console.log(`${queued.length} Queued TXs for ${address}`)
        }
        let nonces = Object.keys(pending);
        for(let i=0; i<nonces.length; i++) {
            let nonce = nonces[i];
            let gasPrice = web3.utils.hexToNumber(pending[nonce].gasPrice);
            let gas = web3.utils.hexToNumber(pending[nonce].gas);
            console.log(`Nonce ${nonce} Gas Price ${gasPrice} Gas ${gas}`);
        }

    })
    .catch(err => {
        console.log(err);
    })
}

function loadProfile(profileNumber) {
    let content = fs.readFileSync(`${profileDir}/profile${profileNumber}.json`, 'utf-8');
    let profile = JSON.parse(content);
    return profile;
}

function main() {
    let [,, ...args] = process.argv;

    let profileNumber = args[0];

    let profile = loadProfile(profileNumber);
    queryMempool(config.provider, profile.wallets.transfer.address);
}

main(2);
