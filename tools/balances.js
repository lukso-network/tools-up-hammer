
const Web3 = require("web3");
const config = require("../config.json");
const {getAddresses, getProfiles} = require("../helpers");

let web3 = new Web3(config.provider);

const profileDir = "./profiles/";

async function testProfileBalances(web3, profiles) {
    
    for(let p=0; p<profiles.length; p++) {
        try {
            
            let resp = await web3.eth.getBalance(profiles[p]);
            console.log(`Balance ${profiles[p]}: ${resp}`);
        } catch(e) {
            console.log(e);
        }
    }


}
async function main() {
    let profiles = getProfiles(profileDir);
    let addresses = getAddresses(profiles);
    testProfileBalances(web3, addresses);
}

main();