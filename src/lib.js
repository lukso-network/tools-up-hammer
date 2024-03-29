const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8IdentifiableDigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP8IdentifiableDigitalAsset.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;
const config = require("./config.json");

const {
    log, 
    warn,
    DEBUG, 
    VERBOSE, 
    INFO
} = require('./logging');

const {
    nextNonce, 
    errorHandler, 
    randomIndex, 
    randomKey, 
    logTx, 
    addNonceToDroppedNoncesIfNotPresent, 
    savePresets, 
    accountForNonce, 
    storeSentNonce 
} = require("./utils");

const OPERATION_CALL = 0;

/**
 * Reinits lspFactory. This was found to help resolve nonce issues
 * @param {*} lspFactory 
 * @param {*} config 
 */
function reinitLspFactory(lspFactory, config) {
    lspFactory = new LSPFactory(lspFactory.options.provider, {
        deployKey: config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
        chainId: config.chainId // Chain Id of the network you want to connect to
      });
    return lspFactory;
}

/**
 * Initializes the first UPs
 * @param {*} state 
 */
async function initUP(state) {
    let {lspFactory, web3, config } = state;

    lspFactory = reinitLspFactory(lspFactory, config);

    let erc725_address, erc725;
    let km_address, km;
    
    
    log(`Deploying Profile`, INFO, state);
    let deployed = await deploy(lspFactory, config, state);
    if(deployed) {
        erc725_address = deployed.LSP0ERC725Account.address;
        km_address = deployed.LSP6KeyManager.address;
    } else {
        return;
    }
    

    log(`ERC725 address:     ${erc725_address}`, INFO, state);
    log(`KeyManager address: ${km_address}`, INFO, state);
    erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
    km = new web3.eth.Contract(KeyManager.abi, km_address);
    state.up[erc725_address] = {
        erc725,
        km
    }
    if(state.config.buildPresets) {
        savePresets(state, state.config.presetsFile);
    }
}

/**
 * Deploy UP (LSP3 Account)
 */ 
async function deploy(lspFactory, config, state) {
    lspFactory = reinitLspFactory(lspFactory, config);

    let controller_addresses = [
        config.wallets.deploy.address,
        config.wallets.transfer.address
    ];
    try {
        const up = await lspFactory.UniversalProfile.deploy(
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
            }).catch((e) =>{
                warn(e.toString().substring(0,100), INFO, state);
            })
    
        return up;
    } catch(e) {
        warn("Error during UP Deployment", INFO, state);
        console.log(e);
    }
    
}

/**
 * Deploys an LSP8
 * @param {*} lspFactory 
 * @param {*} web3 
 * @param {*} owner_address 
 * @param {*} EOA 
 * @param {*} state 
 */
async function deployLSP8(lspFactory, web3, owner_address, EOA, state) {
    lspFactory = reinitLspFactory(lspFactory, state.config);

    try {
        const lsp8_asset = await lspFactory.LSP8IdentifiableDigitalAsset.deploy({
            name: "My token",
            symbol: "TKN",
            controllerAddress: owner_address, // Account which will own the Token Contract
        },
        {
            deployProxy: state.config.deployProxy
        }).catch((e) => {
            warn(e.toString().substring(0,100), INFO, state);
        })

        const lsp8 = new web3.eth.Contract(
            LSP8IdentifiableDigitalAsset.abi,
            lsp8_asset.LSP8IdentifiableDigitalAsset.address,
            {
                from: EOA.deploy.address
            }
        );
        return lsp8;     
    } catch (e) {
        warn("Error during LSP8 Deployment", INFO, state);
    }
    
}

/** 
 * Deploys LSP7
 */
async function deployLSP7(lspFactory, web3, owner_address, EOA, state) {
    lspFactory = reinitLspFactory(lspFactory, state.config);
    
    // let nonce = incrementNonce(state);
    try {
        const digitalAsset = await lspFactory.LSP7DigitalAsset.deploy({
            name: "Some LSP7",
            symbol: "TKN",
            controllerAddress: owner_address, // Account which will own the Token Contract
            isNFT: false,
        },
        {
            deployProxy: state.config.deployProxy
        }).catch((e) => {
            warn(e.toString().substring(0,100), INFO, state);
        })
        
        const lsp7 = new web3.eth.Contract(
            LSP7Mintable.abi,
            digitalAsset.LSP7DigitalAsset.address,
            {
                from: EOA.deploy.address
            }
        );

        return lsp7;
    } catch(e) {
        warn("Error during LSP7 Deployment", INFO, state);
        warn(e, INFO, state);
    }
    
}

/**
 * Prepares for minting an lsp7 or lsp8
 * @param {string} type 'lsp7 | lsp8'
 * @param {json} abi Contract ABI
 * @param {*} state 
 */
async function attemptMint(type, abi, state) {
    let lsp = state[type];
    let {up, EOA, web3} = state;
    
    state.monitor.tx.attemptedMint++;
    if(Object.keys(lsp.addresses).length > 0) {
        
        let asset_address = randomKey(lsp.addresses);
        let erc725_address = lsp.addresses[asset_address].owner;

        let lsp_asset = new web3.eth.Contract(abi, asset_address);

        let mint_amt_or_id = 100;

        if(type==='lsp8') {
            // we need to mint an Identifier, not an amount
            // since this will be called multiple times before any tx completes,
            // we need to know the current state of the lsp8s supply
            // however, we cannot keep state ourselves because the calls are not guaranteed to succeed
            // this will likely cause reverts if we try to mint the same id twice
            try {
                let nextId = await lsp_asset.methods.totalSupply().call();
                nextId = parseInt(nextId) + 1;
                mint_amt_or_id = web3.utils.toHex(nextId);
            } catch(e) {
                errorHandler(state, e);
                return;
            }
            
        }

        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        if(!up[erc725_address]) {
            // state of up is not right. abort
            return;
        }
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        
        mint(lsp_asset, erc725_address, mint_amt_or_id, {erc725, km}, EOA, state, type.toUpperCase());
        
    } else {
        warn(`[!] No ${type} to mint`, INFO);
    }
}

/**
 * Mints an LSP
 * @param {Contract} lsp - the LSP contract
 * @param {string} up_address - address of the controlling UP
 * @param {*} amt_or_id  - the amount to mint, or the id (for LSP8)
 * @param {erc725: Contract, km: Contract} up  
 * @param {*} EOA - Externally Owned Account. needs to have the transfer wallet inside
 * @param {*} state 
 * @param {string} type - 'lsp7 | lsp8' 
 */
async function mint(lsp, up_address, amt_or_id, up, EOA, state, type) {
    //https://docs.lukso.tech/guides/assets/create-lsp7-digital-asset/
    let next, nonce, gasPrice;
    try {
        let targetPayload = await lsp.methods.mint(up_address, amt_or_id, false, '0x').encodeABI();
        
        let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

        // default gasPrice
        let defaultGasPrice = state.config.defaultGasPrice;

        next = nextNonce(state);
        nonce = next.nonce;
        gasPrice = next.gasPrice? next.gasPrice: defaultGasPrice;

        log(`[+] Minting more ${type} (${nonce})`, VERBOSE);
        // let gasPriceWei = await state.web3.eth.getGasPrice();
        // let gasWei = await up.km.methods.execute(abiPayload).estimateGas()
        
        if(next.gasPrice) {
            log(`Replaying ${nonce} with gasPrice ${gasPrice}`, INFO);
        }

        state.monitor.tx.mint++;
        storeSentNonce(state, nonce);
        up.km.methods.execute(abiPayload).send({
            from: EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice,
            nonce
        })
        .on('transactionHash', function(hash){
            log(`[+] Tx: ${hash} Nonce: ${nonce}`, VERBOSE);
            if(state.config.checkPendingTxs) {
                state.pendingTxs[hash] = nonce;
            }
            
            state.monitor.tx.hash++;
            accountForNonce(state, nonce);
        })
        .on('receipt', function(receipt){
            log(`Minted tokens ${receipt.transactionHash} to ${lsp._address} Nonce ${nonce} `, INFO);
            state[type.toLowerCase()].transferable = true;
            delete state.pendingTxs[receipt.transactionHash];
            state.monitor.tx.receipts.mints++;
            if(state.config.logTx) {
                logTx(state.config.txTransactionLog, receipt.transactionHash, nonce);
            }
            accountForNonce(state, nonce);
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            warn(`[!] Minting Error. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
            accountForNonce(state, nonce);
            warn(error, VERBOSE);
            errorHandler(state, error, nonce, receipt, gasPrice);
        });
        
    } catch(e) {
        warn(`Error during minting. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
        // console.log(e);
        accountForNonce(state, nonce); 
        errorHandler(state, e, nonce, null, gasPrice);
    }
    
}

/**
 * Transfers an LSP
 * @param {*} lsp - The LSP Contract object 
 * @param {*} _from - from address
 * @param {*} _to  - to address
 * @param {*} amount - the amount
 * @param {*} up - the controlling UP
 * @param {*} state 
 * @param {*} type - 'lsp7|lsp8'
 */
async function transfer(lsp, _from, _to, amount, up, state, type ) {
    let next, nonce, gasPrice;
    try {
        // function transfer(address from, address to, uint256 amount, bool force, bytes memory data) external;
        let targetPayload = lsp.methods.transfer(_from, _to, amount, false, '0x').encodeABI();
        
        
        let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

        // default gasPrice
        let defaultGasPrice = state.config.defaultGasPrice;

        next = nextNonce(state);

        nonce = next.nonce;
        gasPrice = next.gasPrice? next.gasPrice: defaultGasPrice;
        
        log(`Transfering ${type.toUpperCase()} (${nonce})`, VERBOSE);
        log(`Transferring (${nonce}) ${amount} of ${lsp._address} from ${_from} to ${_to}`, DEBUG);
        
        if(next.gasPrice) {
            log(`Replaying ${nonce} with gasPrice ${gasPrice}`, INFO);
        }

        state.monitor.tx.sent++;

        storeSentNonce(state, nonce);
        
        up.km.methods.execute(abiPayload).send({
            from: up.EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice,
            nonce
        })
        .on('transactionHash', function(hash){
            log(`Tx: ${hash} Nonce: ${nonce}`, VERBOSE);
            if(state.config.checkPendingTxs) {
                state.pendingTxs[hash] = nonce;
            }
            state.monitor.tx.hash++;
            accountForNonce(state, nonce);
        })
        .on('receipt', function(receipt){
            log(`Transfer complete ${receipt.transactionHash} Nonce ${nonce}`, INFO);
            delete state.pendingTxs[receipt.transactionHash];
            if(state.config.logTx) {
                logTx(state.config.txTransactionLog, receipt.transactionHash, nonce);
            }
            state.monitor.tx.receipts.transfers++;
            accountForNonce(state, nonce);
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            warn(`Transfer Error. Nonce ${nonce}`, INFO);
            log(error, VERBOSE);
            accountForNonce(state, nonce);
            errorHandler(state, error, nonce, receipt, gasPrice);
           
        });
    } catch(e) {
        warn(`Error during transfer. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
        console.log(e, VERBOSE);
        accountForNonce(state, nonce);
        errorHandler(state, e, nonce, null, gasPrice);
       
    }
    
}


module.exports = {
    mint,
    deploy,
    deployLSP7,
    deployLSP8,
    transfer,
    randomIndex,
    randomKey,
    attemptMint,
    initUP,
    addNonceToDroppedNoncesIfNotPresent
}