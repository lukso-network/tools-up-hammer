const crypto = require('crypto');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const mchammer = require('./lib');

async function loop_deployUP(state) {
    console.log(`[+] Deploying new UP`);
    let {lspFactory, web3, EOA, up, DEPLOY_PROXY} = state;
    let deployed = await mchammer.deploy(lspFactory, process.env.ADDRESS, DEPLOY_PROXY);
    let erc725_address = deployed.ERC725Account.address;
    let km_address = deployed.KeyManager.address;
    
    console.log(`[+] ERC725 address:     ${erc725_address}`);
    console.log(`[+] KeyManager address: ${km_address}`);
    let erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
    let km = new web3.eth.Contract(KeyManager.abi, km_address);
    state.up[erc725_address] = {
        erc725,
        km
    }
}
async function loop_deployLSP7(state) {
    console.log(`[+] Deploying new LSP7`);
    let {lspFactory, web3, EOA, up, lsp7} = state;
    let lsp7_asset, erc725_address;
    // this is a hack for the time being
    // if(Object.keys(lsp7).length > 0) { 
    //     return; 
    // } else 
    if(Object.keys(lsp7).length === 0 && process.env.LSP7_ADDRESS) {
        lsp7_asset = new web3.eth.Contract(LSP7Mintable.abi, process.env.LSP7_ADDRESS);
        erc725_address = await lsp7_asset.methods.owner().call();
    } else {
        erc725_address = mchammer.randomKey(up); 
        lsp7_asset = await mchammer.deployLSP7(lspFactory, web3, erc725_address, EOA);
    }
    
    console.log(`[+] LSP7 address:       ${lsp7_asset._address}`);
    state.lsp7[lsp7_asset._address] = {
        owner: erc725_address,
        totalSupply: 0,
    }
}
async function loop_deployLSP8(state) {
    console.log(`[+] Deploying new LSP8`);
}
async function loop_mintLSP7(state) {
    console.log(`[+] Minting more LSP7`);
    let {web3, EOA, up, lsp7} = state;
    if(Object.keys(lsp7).length > 0) {
        let idx = crypto.randomBytes(1)[0] % Object.keys(lsp7).length;
        let lsp7_address = Object.keys(lsp7)[idx];
        let erc725_address = lsp7[lsp7_address].owner;

        let mint_amt = 100;

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        lsp7_asset = new web3.eth.Contract(LSP7Mintable.abi, lsp7_address);
        await mchammer.mint(lsp7_asset, erc725_address, mint_amt, {erc725, km}, EOA);
        state.lsp7[lsp7_address].totalSupply += mint_amt;
    }
    
}
async function loop_mintLSP8(state) {
    console.log(`[+] Minting more LSP7`);
}
async function loop_transferLSP7(state) {
    console.log(`[+] Transfering LSP7`);
    let {web3, EOA, up, lsp7} = state;
    if(Object.keys(lsp7).length > 0) {
        let totalSupply = "0";
        let lsp7_asset;
        // as long as one lsp7 asset has a totalSupply >= transfer amount, this won't get stuck
        // need to ensure that condition is always met
        while(totalSupply === "0") {
            let lsp7_address = mchammer.randomKey(lsp7);
            lsp7_asset = new web3.eth.Contract(LSP7Mintable.abi, lsp7_address);
            totalSupply = await lsp7_asset.methods.totalSupply().call();    
        }
        
        let sender_balance = "0";
        let erc725_address;
        while(sender_balance === "0") {
            erc725_address = mchammer.randomKey(up);
            sender_balance = await lsp7_asset.methods.balanceOf(erc725_address).call();
        }
        let sending_address = erc725_address;
        console.log(`[+] Sender ${sending_address} has balance of ${sender_balance} tokens`);
        // probably a much cleaner way to do the following
        // let other_addresses = Object.keys(up).filter(addr => addr != sending_address);
        // if (sender_balance === "0") {
        //     for(let i=0; i<other_addresses.length; i++) {
        //         let other_balance = await lsp7_asset.methods.balanceOf(other_addresses[i]).call();
        //         if(other_balance !== "0") {
        //             sending_address = other_addresses[i];
        //             break;
        //         }
        //     }
        // }
        
        // with an unknown amount of UPs, select a destination randomly
        let recv_address = sending_address;
        while(recv_address === sending_address)
        {
            // loop until we find an address that is not the sender
            // let other_idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
            // recv_address = Object.keys(up)[other_idx];
            recv_address = mchammer.randomKey(up);
        }
        console.log(`[+] Receiver will be ${recv_address}`);
        
        // fix amount at 100 so we don't exceed operator authorized amount
        let amount = 100; //await lsp7_asset.methods.balanceOf(sending_address).call();

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        console.log(`[+] Transferring ${amount} of ${lsp7_asset._address} from ${sending_address} to ${recv_address}`);
        try {
            await mchammer.transfer(lsp7_asset, sending_address, recv_address, amount, {erc725, km}, EOA)
            console.log(`[+] Transfered complete`);
        } catch(e) {
            console.log(e);
        }
    }
}
async function loop_transferLSP8(state) {
    console.log(`[+] Transfering LSP8`);
}

module.exports = {
    loop_deployUP,
    loop_deployLSP7,
    loop_deployLSP8,
    loop_mintLSP7,
    loop_mintLSP8,
    loop_transferLSP7,
    loop_transferLSP8
}