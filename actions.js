const crypto = require('crypto');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP8Mintable.json');
const mchammer = require('./lib');
const config = require("./config.json");

const log = require("./logging").log;
const warn = require("./logging").warn;
const DEBUG = require("./logging").DEBUG;
const VERBOSE = require("./logging").VERBOSE;
const INFO = require("./logging").INFO;
const QUIET = require("./logging").QUIET

async function loop_deployUP(state) {
    if(Object.keys(state.up).length <= config.deployLimits.up) {
        console.log(`[+] Deploying new UP`);
        let {lspFactory, web3, EOA, up} = state;
        let deployed = await mchammer.deploy(lspFactory);
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
}
async function loop_deployLSP7(state) {
    if(Object.keys(state.lsp7.addresses).length <= config.deployLimits.lsp7) {
        console.log(`[+] Deploying new LSP7`);
        let {lspFactory, web3, EOA, up, lsp7} = state;
        let lsp7_asset, erc725_address;

        if(Object.keys(lsp7.addresses).length < config.presets[config.wallets.deploy.address].lsp7.length) {
            let preset = Object.keys(lsp7.addresses).length;
            lsp7_asset = new web3.eth.Contract(LSP7Mintable.abi, config.presets[config.wallets.deploy.address].lsp7[preset]);
            erc725_address = config.wallets.deploy.address; //await lsp7_asset.methods.owner().call();
        } else {
            erc725_address = mchammer.randomKey(up); 
            lsp7_asset = await mchammer.deployLSP7(lspFactory, web3, erc725_address, EOA, state);
        }

        console.log(`[+] LSP7 address:       ${lsp7_asset._address}`);
        state.lsp7.addresses[lsp7_asset._address] = {
            owner: erc725_address,
            totalSupply: 0,
        }
    }
    

}
async function loop_deployLSP8(state) {
    if(Object.keys(state.lsp8.addresses).length <= config.deployLimits.lsp8) {
        console.log(`[+] Deploying new LSP8`);
        let {lspFactory, web3, EOA, up, lsp8} = state;
        let lsp8_asset, erc725_address
        let totalSupply = 0; 
        let currentId = 0;

        if(Object.keys(lsp8.addresses).length < config.presets[config.wallets.deploy.address].lsp8.length) {
            let preset = Object.keys(lsp8.addresses).length;
            lsp8_asset = new web3.eth.Contract(LSP7Mintable.abi, config.presets[config.wallets.deploy.address].lsp8[preset]);
            erc725_address = await lsp8_asset.methods.owner().call();
            totalSupply = await lsp8_asset.methods.totalSupply().call();
            currentId = totalSupply;
        } else {
            erc725_address = mchammer.randomKey(up); 
            lsp8_asset = await mchammer.deployLSP8(lspFactory, web3, erc725_address, EOA, state);

        }
        console.log(`[+] LSP8 address:       ${lsp8_asset._address}`);
        
        state.lsp8.addresses[lsp8_asset._address] = {
            owner: erc725_address,
            totalSupply,
            currentId
        } 
    }

}
async function loop_mintLSP7(state) {
    log(`[+] Minting more LSP7`, VERBOSE);
    let {lsp7} = state;
    if(Object.keys(state.lsp7.addresses).length > 0) {
        await mchammer.doMint('lsp7', LSP7Mintable.abi, state);
    } else {
       log('[!] No LSP7 to mint', VERBOSE);
    }
    
}
async function loop_mintLSP8(state) {
    log(`[+] Minting more LSP8`, VERBOSE);
    if(Object.keys(state.lsp8.addresses).length > 0) {
        await mchammer.doMint('lsp8', LSP8Mintable.abi, state);
    } else {
        log('[!] No LSP8 to Mint', VERBOSE);
    }
}

async function loop_transferLSP7(state) {
    do_transferLSP7(state, undefined);
}

async function loop_transferAllLSP7(state) {
    do_transferLSP7(state, 'all');
}

async function do_transferLSP7(state, tx_amt_type) {
    log(`[+] Transfering LSP7`, VERBOSE);
    let {web3, EOA, up, lsp7} = state;
    if(lsp7.transferable) {
        let amount;
        let totalSupply = "0";
        let lsp7_asset;
        // as long as one lsp7 asset has a totalSupply >= transfer amount, this won't get stuck
        // need to ensure that condition is always met
        while(totalSupply === "0") {
            let lsp7_address = mchammer.randomKey(lsp7.addresses);
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
        log(`[+] Sender ${sending_address} has balance of ${sender_balance} tokens`, VERBOSE);

        if(tx_amt_type === 'all') {
            amount = parseInt(sender_balance);
        } else {
            amount = crypto.randomInt(parseInt(sender_balance));
        }

        // with an unknown amount of UPs, select a destination randomly
        let recv_address = sending_address;
        while(recv_address === sending_address)
        {
            // loop until we find an address that is not the sender
            // let other_idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
            // recv_address = Object.keys(up)[other_idx];
            recv_address = mchammer.randomKey(up);
        }
        // console.log(`[+] Receiver will be ${recv_address}`);

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        
        try {
            mchammer.transfer(lsp7_asset, sending_address, recv_address, amount, {erc725, km, EOA}, state)
            
        } catch(e) {
            warn(e, INFO);
        }
    } else {
        warn('[!] No LSP7 to Transfer', VERBOSE);
    }
}


async function loop_transferLSP8(state) {
    log(`[+] Transfering LSP8`, VERBOSE);
    let {web3, EOA, up, lsp8} = state;
    if(lsp8.transferable) {
        let totalSupply = "0";
        let lsp8_contract, lsp8_address;
        // as long as one lsp8 assets has a totalSupply >= transfer amount, this won't get stuck
        // need to ensure that condition is always met
        while(totalSupply === "0") {
            lsp8_address = mchammer.randomKey(lsp8.addresses);
            lsp8_contract = new web3.eth.Contract(LSP8Mintable.abi, lsp8_address);
            totalSupply = await lsp8_contract.methods.totalSupply().call();
        }
        
        
        // select a random token from the supply
        let tokenId = parseInt(crypto.randomInt(parseInt(totalSupply))) + 1; // prevent id from being 0
        let tokenIdBytes = web3.utils.toHex(tokenId);

        // find out who owns it
        let owner = await lsp8_contract.methods.tokenOwnerOf(tokenIdBytes).call();
        log(`[+] Sender ${owner} owns ${tokenIdBytes} token`, DEBUG);

        // select a random recipient
        let recv_address = owner;
        while(recv_address === owner)
        {
            // loop until we find an address that is not the sender
            // let other_idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
            // recv_address = Object.keys(up)[other_idx];
            recv_address = mchammer.randomKey(up);
        }
        log(`[+] Receiver will be ${recv_address}`, DEBUG);

        // send
        erc725 = new web3.eth.Contract(UniversalProfile.abi, owner);
        km = new web3.eth.Contract(KeyManager.abi, up[owner].km._address);
        log(`[+] Transferring ${tokenIdBytes} of ${lsp8_contract._address} from ${owner} to ${recv_address}`, DEBUG);
        try {
            await mchammer.transfer(lsp8_contract, owner, recv_address, tokenIdBytes, {erc725, km, EOA}, state);
        } catch(e) {
            console.log(e);
        }
    } else {
        warn('[!] No LSP8 to transfer', VERBOSE);
    }
    
}

module.exports = {
    loop_deployUP,
    loop_deployLSP7,
    loop_deployLSP8,
    loop_mintLSP7,
    loop_mintLSP8,
    loop_transferLSP7,
    loop_transferAllLSP7,
    loop_transferLSP8
}