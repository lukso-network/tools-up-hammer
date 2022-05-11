const crypto = require('crypto');
const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8IdentifiableDigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP8IdentifiableDigitalAsset.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;
const config = require("./config.json");

const log = require("./logging").log;
const warn = require("./logging").warn;
const DEBUG = require("./logging").DEBUG;
const VERBOSE = require("./logging").VERBOSE;
const INFO = require("./logging").INFO;
const QUIET = require("./logging").QUIET


const OPERATION_CALL = 0;

function reinitLspFactory(lspFactory) {
    lspFactory = new LSPFactory(lspFactory.options.provider, {
        deployKey: config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
        chainId: 22, // Chain Id of the network you want to connect to
      });
    return lspFactory;
}

function incrementNonce(state) {
    let nonce = state.nonce++;
    // if(crypto.randomInt(10) < 3) {
    //     // inject a nonce fault
    //     let oldNonce = nonce;
    //     nonce = state.nonce++;
    //     state.pendingTxs.push({hash: "0x845181cb4362fce9560ddc7de6a69ad3a1e65711d9bafae16b52b01d7fd82c5f", nonce: oldNonce});
    // }
    log(`[+] Sending  tx with nonce ${nonce}`, DEBUG);
    return nonce;
}

async function initUP(state) {
    let {lspFactory, web3 } = state;
    let erc725_address, erc725;
    let km_address, km;
    let up, deployed;
    if(config.presets[config.wallets.deploy.address].up.length > 0 && !state.up[config.presets[config.wallets.deploy.address].up[0].ERC725_ADDRESS]) {
        log(`[+] Found UP addresses. Skipping deployments`, VERBOSE);
        erc725_address = config.presets[config.wallets.deploy.address].up[0].ERC725_ADDRESS;
        km_address = config.presets[config.wallets.deploy.address].up[0].KEYMANAGER_ADDRESS;
    } else if(config.presets[config.wallets.deploy.address].up.length > 1 && !state.up[config.presets[config.wallets.deploy.address].up[1].ERC725_ADDRESS]) {
        log(`[+] Found Secondary UP. Skipping deployments`, VERBOSE);
        erc725_address = config.presets[config.wallets.deploy.address].up[1].ERC725_ADDRESS;
        km_address = config.presets[config.wallets.deploy.address].up[1].KEYMANAGER_ADDRESS;
    } else {
        log(`[+] Deploying Profile`, VERBOSE);
        deployed = await deploy(lspFactory);
        erc725_address = deployed.ERC725Account.address;
        km_address = deployed.KeyManager.address;
    }
    log(`[+] ERC725 address:     ${erc725_address}`, INFO);
    log(`[+] KeyManager address: ${km_address}`, INFO);
    erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
    km = new web3.eth.Contract(KeyManager.abi, km_address);
    state.up[erc725_address] = {
        erc725,
        km
    }
}

// Deploy LSP3 Account
async function deploy(lspFactory) {
    lspFactory = reinitLspFactory(lspFactory);

    let controller_addresses = [
        config.wallets.deploy.address,
        config.wallets.transfer.address
    ];
    const up = await lspFactory.LSP3UniversalProfile.deploy(
        {
            controllerAddresses: controller_addresses, // Address which will controll the UP
            lsp3Profile: lsp3Profile,
        },
        {
            ERC725Account: {
                deployProxy: config.deployProxy,
            },
            UniversalReceiverDelegate: {
                deployProxy: config.deployProxy,
            },
            KeyManager: {
                deployProxy: config.deployProxy, 
            }
        }
    );
    return up;
}

async function deployLSP8(lspFactory, web3, owner_address, EOA, state) {
    lspFactory = reinitLspFactory(lspFactory);

    // let nonce = incrementNonce(state);

    const lsp8_asset = await lspFactory.LSP8IdentifiableDigitalAsset.deploy({
        name: "My token",
        symbol: "TKN",
        controllerAddress: owner_address, // Account which will own the Token Contract
        // nonce
    })

    const lsp8 = new web3.eth.Contract(
        LSP8IdentifiableDigitalAsset.abi,
        lsp8_asset.LSP8IdentifiableDigitalAsset.address,
        {
            from: EOA.deploy.address
        }
    );

    return lsp8;
}

async function deployLSP7(lspFactory, web3, owner_address, EOA, state) {
    lspFactory = reinitLspFactory(lspFactory);
    
    // let nonce = incrementNonce(state);
    
    const digitalAsset = await lspFactory.LSP7DigitalAsset.deploy({
        name: "Some LSP7",
        symbol: "TKN",
        controllerAddress: owner_address, // Account which will own the Token Contract
        isNFT: false,
        // nonce
    })
    
    const lsp7 = new web3.eth.Contract(
        LSP7Mintable.abi,
        digitalAsset.LSP7DigitalAsset.address,
        {
            from: EOA.deploy.address
        }
    );
    
    return lsp7;
}

async function doMint(type, abi, state) {
    let lsp = state[type];
    let {up, EOA, web3} = state;

    if(Object.keys(lsp.addresses).length > 0) {
        
        let asset_address = randomKey(lsp.addresses);
        let erc725_address = lsp.addresses[asset_address].owner;

        let lsp_asset = new web3.eth.Contract(abi, asset_address);

        let mint_amt_or_id = 100;

        if(type==='lsp8') {
            // we need to mint an Identifier, not an amount
            // since this will be called multiple times before any tx completes,
            // need to maintain state of the ids ourselves
            let nextId = lsp.addresses[asset_address].currentId++;
            mint_amt_or_id = web3.utils.toHex(nextId+1);
        }

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        
        await mint(lsp_asset, erc725_address, mint_amt_or_id, {erc725, km}, EOA, state);
        state[type].transferable = true;
        if(type==='lsp7') {
            state[type].addresses[asset_address].totalSupply += mint_amt_or_id;
        } else {
            state[type].addresses[asset_address].totalSupply += 1;
        }
        
    } else {
        warn(`[!] No ${type} to mint`, INFO);
    }
}

//https://docs.lukso.tech/guides/assets/create-lsp7-digital-asset/
async function mint(lsp, up_address, amt_or_id, up, EOA, state) {

    let targetPayload = await lsp.methods.mint(up_address, amt_or_id, false, '0x').encodeABI();
    
    let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

    let nonce = incrementNonce(state);

    try {
        await up.km.methods.execute(abiPayload).send({
            from: EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice: '1000000000',
            nonce
        })
        .on('transactionHash', function(hash){
            console.log(`[+] Tx: ${hash} Nonce: ${nonce}`);
            state.txs.push({nonce, hash});
        })
        .on('receipt', function(receipt){
            // let totalSupply = await 
            lsp.methods.totalSupply().call().then((totalSupply) => {
                console.log(`[+] Minted ${totalSupply} tokens to ${lsp._address} Nonce ${nonce}`);
            })
            
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            warn(`[!] Transfer Error. Nonce ${nonce}`, INFO);
            warn(error, INFO);
            if(receipt) {
                log(receipt, VERBOSE);
            }
        });
    
        
        
    } catch(e) {
        warn(`[!] Error during minting. Nonce ${nonce}`, INFO);
    }
    
}

async function transfer(lsp, _from, _to, amount, up, state ) {
    // function transfer(address from, address to, uint256 amount, bool force, bytes memory data) external;
    let targetPayload = lsp.methods.transfer(_from, _to, amount, false, '0x').encodeABI();
    
    let nonce = incrementNonce(state);

    let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

    log(`[+] Transferring (${nonce}) ${amount} of ${lsp._address} from ${_from} to ${_to}`, DEBUG);
    try {
        up.km.methods.execute(abiPayload).send({
            from: up.EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice: '1000000000',
            nonce
        })
        .on('transactionHash', function(hash){
            log(`[+] Tx: ${hash} Nonce: ${nonce}`, INFO);
            state.pendingTxs.push({nonce, hash});
        })
        .on('receipt', function(receipt){
            log(`[+] Transfer complete ${receipt.transactionHash} Nonce ${nonce}`, INFO);
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            warn(`[!] Transfer Error. Nonce ${nonce}`, INFO);
            log(error, INFO);
            if(receipt) {
                log(receipt, VERBOSE);
            }
        });
    } catch(e) {
        warn(e, INFO);
    }
    
}

function randomIndex(obj) {
    return crypto.randomInt(Object.keys(obj).length);
}

function randomKey(obj) {
    let idx = randomIndex(obj);
    return Object.keys(obj)[idx];
}
module.exports = {
    mint,
    deploy,
    deployLSP7,
    deployLSP8,
    transfer,
    randomIndex,
    randomKey,
    doMint,
    initUP,
}