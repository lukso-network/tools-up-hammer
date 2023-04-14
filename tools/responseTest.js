const Web3 = require("web3");
const config = require("../src/config.json");

const l16 = config.provider;
console.log(l16);

// bootnode IPs. These are definitely outdated.
let ips = [
    "34.141.186.165",
    "34.90.174.53",
    "34.91.85.185",
    "34.91.191.203",
    "34.90.88.245",
    "34.90.88.247",
    "34.147.106.74",
    "35.204.176.52",
    "34.90.106.206",
    "34.91.183.140"
]


async function testBootnodes() {
    for(i in ips) {
        let endpoint = `http://${ips[i]}:8545/`;
        console.log(endpoint);
        let web3 = new Web3(endpoint);
        for(p in profiles) {
            try {
            
                let resp = await web3.eth.getBalance(profiles[p]);
                console.log(resp);
            } catch(e) {
                console.log(e);
            }
        }
        
        
    }
    
}

async function main() {
    await testBootnodes();
    
}

main();
