const crypto = require('crypto');
const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8IdentifiableDigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP8IdentifiableDigitalAsset.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;
const config = require("./config.json");
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
    console.log(`[+] Sending  tx with nonce ${nonce}`);
    return nonce;
}

async function initUP(state) {
    let {lspFactory, web3 } = state;
    let erc725_address, erc725;
    let km_address, km;
    let up, deployed;
    if(config.presets.up.length > 0 && !state.up[config.presets.up[0].ERC725_ADDRESS]) {
        console.log(`[+] Found UP addresses. Skipping deployments`);
        erc725_address = config.presets.up[0].ERC725_ADDRESS;
        km_address = config.presets.up[0].KEYMANAGER_ADDRESS;
    } else if(config.presets.up.length > 1 && !state.up[config.presets.up[1].ERC725_ADDRESS]) {
        console.log(`[+] Found Secondary UP. Skipping deployments`);
        erc725_address = config.presets.up[1].ERC725_ADDRESS;
        km_address = config.presets.up[1].KEYMANAGER_ADDRESS;
    } else {
        console.log(`[+] Deploying Profile`);
        deployed = await deploy(lspFactory);
        erc725_address = deployed.ERC725Account.address;
        km_address = deployed.KeyManager.address;
    }
    console.log(`[+] ERC725 address:     ${erc725_address}`);
    console.log(`[+] KeyManager address: ${km_address}`);
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

    if(Object.keys(lsp).length > 0) {
        
        let asset_address = randomKey(lsp);
        let erc725_address = lsp[asset_address].owner;


        let mint_amt_or_id = 100;
        if(type==='lsp8') {
            // we need to mint an Identifier, not an amount
            mint_amt_or_id = web3.utils.toHex(state.lsp8[asset_address].totalSupply + 1);
        }

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        let lsp_asset = new web3.eth.Contract(abi, asset_address);
        await mint(lsp_asset, erc725_address, mint_amt_or_id, {erc725, km}, EOA, state);
        if(type==='lsp7') {
            state[type][asset_address].totalSupply += mint_amt_or_id;
        } else {
            state[type][asset_address].totalSupply += 1;
        }
        
    } else {
        console.log(`[!] No ${type} to mint :(`);
    }
}

//https://docs.lukso.tech/guides/assets/create-lsp7-digital-asset/
async function mint(lsp, up_address, amt_or_id, up, EOA, state) {

    let targetPayload = await lsp.methods.mint(up_address, amt_or_id, false, '0x').encodeABI();
    
    let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

    let nonce = incrementNonce(state);

    await up.km.methods.execute(abiPayload).send({
        from: EOA.transfer.address, 
        gas: 5_000_000,
        gasPrice: '1000000000',
        nonce
      });

    
    let totalSupply = await lsp.methods.totalSupply().call()
    console.log(`[+] Minted ${totalSupply} tokens to ${lsp._address}`);
}

async function transfer(lsp, _from, _to, amount, up, state ) {
    // function transfer(address from, address to, uint256 amount, bool force, bytes memory data) external;
    let targetPayload = lsp.methods.transfer(_from, _to, amount, false, '0x').encodeABI();
    
    let nonce = incrementNonce(state);

    let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

    console.log(`[+] Transferring (${nonce}) ${amount} of ${lsp._address} from ${_from} to ${_to}`);
    try {
        up.km.methods.execute(abiPayload).send({
            from: up.EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice: '1000000000',
            nonce
          }).then((res) => {
            if(res) {
                console.log(`[+] Transfer complete`);
                console.log(`[+] Tx: ${res.transactionHash} Nonce: ${nonce}`);
                state.txs.push({nonce, tx: res.transactionHash});
            } 
          });
    } catch(e) {
        console.log(e);
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