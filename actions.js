const crypto = require('crypto');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const mchammer = require('./lib');

async function loop_deployUP(state) {
    console.log(`[+] Deploying new UP`);
}
async function loop_deployLSP7(state) {
    console.log(`[+] Deploying new LSP7`);
    let {lspFactory, web3, EOA, up, lsp7} = state;
    // this is a hack for the time being
    if(Object.keys(lsp7).length > 0) { return; }
    let idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
    let erc725_address = Object.keys(up)[idx];
    let lsp7_asset = await mchammer.deployLSP7(lspFactory, web3, erc725_address, EOA);
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