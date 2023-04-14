const Web3 = require('web3');
const config = require('../src/config.json');
const utils = require('../src/utils');

const {getProfiles, fundSingleAccount} = require("../src/helpers");
const profileDir = "./profiles/";



const web3 = new Web3(config.provider);

let wallets = {}

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
