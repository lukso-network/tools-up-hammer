const crypto = require('crypto');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP8Mintable.json');
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
    let {lspFactory, web3, EOA, up, lsp7} = state;
    let lsp8_asset, erc725_address;
    erc725_address = mchammer.randomKey(up); 
    lsp8_asset = await mchammer.deployLSP8(lspFactory, web3, erc725_address, EOA);
    console.log(`[+] LSP8 address:       ${lsp8_asset._address}`);
    state.lsp8[lsp8_asset._address] = {
        owner: erc725_address,
        totalSupply: 0
    } 
}
async function loop_mintLSP7(state) {
    console.log(`[+] Minting more LSP7`);
    let {web3, EOA, up, lsp7} = state;
    if(Object.keys(lsp7).length > 0) {
        await mchammer.doMint('lsp7', LSP7Mintable.abi, state);
    } else {
        console.log('[!] No LSP7 to mint :(');
    }
    
}
async function loop_mintLSP8(state) {
    console.log(`[+] Minting more LSP8`);
    if(Object.keys(state.lsp8).length > 0) {
        await mchammer.doMint('lsp8', LSP8Mintable.abi, state);
    } else {
        console.log('[!] No LSP8 to Mint');
    }
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
        let amount = 100; 

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        console.log(`[+] Transferring ${amount} of ${lsp7_asset._address} from ${sending_address} to ${recv_address}`);
        try {
            await mchammer.transfer(lsp7_asset, sending_address, recv_address, amount, {erc725, km, EOA})
            console.log(`[+] Transfered complete`);
        } catch(e) {
            console.log(e);
        }
    } else {
        console.log('[!] No LSP7 to Transfer');
    }
}
async function loop_transferLSP8(state) {
    console.log(`[+] Transfering LSP8`);
    let {web3, EOA, up, lsp8} = state;
    if(Object.keys(lsp8).length > 0) {
        let totalSupply = 0;
        let lsp8_contract, lsp8_address;
        // as long as one lsp8 assets has a totalSupply >= transfer amount, this won't get stuck
        // need to ensure that condition is always met
        while(totalSupply === 0) {
            lsp8_address = mchammer.randomKey(lsp8);
            totalSupply = lsp8[lsp8_address].totalSupply;  
        }
        lsp8_contract = new web3.eth.Contract(LSP8Mintable.abi, lsp8_address);
        
        // select a random token from the supply
        let tokenId = parseInt(mchammer.randomKey(Array.from({ length: totalSupply }))) + 1; // prevent id from being 0
        let tokenIdBytes = web3.utils.toHex(tokenId);

        // find out who owns it
        let owner = await lsp8_contract.methods.tokenOwnerOf(tokenIdBytes).call();
        console.log(`[+] Sender ${owner} owns ${tokenIdBytes} token`);

        // select a random recipient
        let recv_address = owner;
        while(recv_address === owner)
        {
            // loop until we find an address that is not the sender
            // let other_idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
            // recv_address = Object.keys(up)[other_idx];
            recv_address = mchammer.randomKey(up);
        }
        console.log(`[+] Receiver will be ${recv_address}`);

        // send
        erc725 = new web3.eth.Contract(UniversalProfile.abi, owner);
        km = new web3.eth.Contract(KeyManager.abi, up[owner].km._address);
        console.log(`[+] Transferring ${tokenIdBytes} of ${lsp8_contract._address} from ${owner} to ${recv_address}`);
        try {
            await mchammer.transfer(lsp8_contract, owner, recv_address, tokenIdBytes, {erc725, km, EOA});
            console.log(`[+] Transfered complete`);
        } catch(e) {
            console.log(e);
        }
    } else {
        console.log('[!] No LSP8 to transfer');
    }
    
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