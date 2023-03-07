const fs = require("fs");
const axios = require('axios');
const delay = require('await-delay');
const Web3 = require('web3');
const config = require('../config.json');
const utils = require('../utils');

const {getAddresses, getProfiles, fundSingleAccount} = require("../helpers");
const profileDir = "./profiles/";



const web3 = new Web3(config.provider);

const faucet = config.faucet;



let wallets = {}

async function getBalances() {
  for(let i=0; i<addresses.length; i++) {
    let address = addresses[i];
    let balance = await web3.eth.getBalance(address);
    wallets[address] = balance;
    console.log(`[*] ${address}  ${balance}`);
  }
}

async function faucetFund(addresses) {
    for(let i=0; i<addresses.length; i++) {
        let address = addresses[i]
        axios
        .post(faucet, {receiver: address})
        .then(res => {
          console.log(`statusCode: ${res.status}`);
        //   console.log(res.data);
          let data = res.data;
          if( data.error) {
              console.log(`[!] ${address} ${data.error.message}`);
            //   failed.push(address);
          } else if(data.success) {
              console.log(`[+] ${address} ${data.success.message}`);
              
          }
        })
        .catch(error => {
          console.error(error);
        });
        await delay(10000);
    }
}

// async function loop(maxRounds) {
        
//     for(let round=0; round<maxRounds; round++) {
//         await fund(addresses);
//     }

// }

// let addresses = [];
// utils.readFiles('profiles/', function(profile) {
//   addresses.push(profile.wallets.deploy.address);
//   addresses.push(profile.wallets.transfer.address);
// },
// function() {
//   getBalances();
//   loop(1);
//   getBalances();
// });

async function main() {

  let [,, ...args] = process.argv;

  if (args.length < 1) {
      console.log(`Usage: ${process.argv[1]} <private key>`)
      process.exit();
  }

  let privateKey = args[0];
  
  let funder = web3.eth.accounts.privateKeyToAccount(privateKey);
  console.log(`[+] Funding from ${funder.address}`)


  let profiles = getProfiles(profileDir);
  let addresses = profiles.flatMap((w) => [w.wallets.transfer.address])
  let availableBalance = await web3.eth.getBalance(funder.address);
  console.log(`[+] Funder has ${availableBalance} ETH`)
  let disperse = availableBalance / (addresses.length + 1);// ensure enough funds for gas
  console.log(`[+] Dispersing ${disperse}`)
  for(address in addresses) {
    await fundSingleAccount(funder, addresses[address], disperse, web3);
  }
}

main();
