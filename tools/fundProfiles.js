const fs = require("fs");
const axios = require('axios');
const delay = require('await-delay');
const Web3 = require('web3');
const config = require('../config.json');
const utils = require('../utils');

const web3 = new Web3(config.provider);

const faucet = config.faucet;


// let addresses = [
//     '0x6B9437DE67937Bf8A12b329E7d3f22b2173Fb584',
//     '0x3EaF9536F2E77E285FAFc84113C3E18c77F360b8',
//     '0x2b2204504ebAFf7B8da9A916808C0583876d5222',
//     '0xAf4beb69589f02aA29D64adff3fa63410F9AfBe4',
//     '0x9e2DCc5E8A8e90F2c6b338A15Cff3AfCfEAa8aDd',
//     '0xb8eb8781DcC89512A4B032103B7E3a475e389d01',
//     '0x39fA87346E1835d899cC23A768225C96Fe40a111',
//     '0xa32287F3DC3FB80d99d37115C1149FE53Aa40583',
//     '0x990a91A96542eD26F32B8FC5191A899FEA7c6b20',
//     '0xABD8529925b829C52DFA0D778457Fd52EfF87ED6',
//     '0x84A130Bb9404B973984A9b76050AEfD404F8e6Bf',
//     '0x1471C7377C09484752D5A8e0085632A9396B6923',
//     '0x909D5C7dab2B202ba279dC65a7432D1243d47430',
//     '0x173d83314C69d1d16308b525fFB4dE163b29569E',
//     '0xC06Bd20F78d119575B7b6A293B4275dBc99d4b01',
//     '0xa48b89C6A7Ad75F9c34eF89Ba227253710612C35',
//     '0x0f7346CC72C8EBfB65f10Ae92604e268D9c1FfF7',
//     '0xe4d2892A5b39A3CbD09907cE8412C4Bd27461240',
//     '0x332F3463b34570087a11546D34Fd11a4881da772',
//     '0xe0b550025159cf68EE553DCFd8f1d9dd720d591C',
// ]

let wallets = {}

async function getBalances() {
  for(let i=0; i<addresses.length; i++) {
    let address = addresses[i];
    let balance = await web3.eth.getBalance(address);
    wallets[address] = balance;
    console.log(`[*] ${address}  ${balance}`);
  }
}

async function fund(addresses) {
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

async function loop(maxRounds) {
        
    for(let round=0; round<maxRounds; round++) {
        await fund(addresses);
    }

}

let addresses = [];
utils.readFiles('profiles/', function(profile) {
  addresses.push(profile.wallets.deploy.address);
  addresses.push(profile.wallets.transfer.address);
},
function() {
  getBalances();
  loop(1);
  getBalances();
});

