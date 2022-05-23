const fs = require('fs');
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

const nextNonce = require("./utils").nextNonce;
const replayAndIncrementGasPrice = require("./utils").replayAndIncrementGasPrice;
const extractHashFromStacktrace = require("./utils").extractHashFromStacktrace;
const randomIndex = require("./utils").randomIndex;
const randomKey = require("./utils").randomKey;
const logTx = require("./utils").logTx;


const OPERATION_CALL = 0;

function reinitLspFactory(lspFactory, config) {
    lspFactory = new LSPFactory(lspFactory.options.provider, {
        deployKey: config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
        chainId: config.chainId // Chain Id of the network you want to connect to
      });
    return lspFactory;
}



async function initUP(state) {
    let {lspFactory, web3, config } = state;

    lspFactory = reinitLspFactory(lspFactory, config);

    let erc725_address, erc725;
    let km_address, km;
    let up, deployed;
    if(config.presets[config.wallets.deploy.address]
        && config.presets[config.wallets.deploy.address].up.length > 0 
        && !state.up[config.presets[config.wallets.deploy.address].up[0].ERC725_ADDRESS]) {
        log(`[+] Found UP addresses. Skipping deployments`, VERBOSE);
        erc725_address = config.presets[config.wallets.deploy.address].up[0].ERC725_ADDRESS;
        km_address = config.presets[config.wallets.deploy.address].up[0].KEYMANAGER_ADDRESS;
    } else if(config.presets[config.wallets.deploy.address] 
        && config.presets[config.wallets.deploy.address].up.length > 1 
        && !state.up[config.presets[config.wallets.deploy.address].up[1].ERC725_ADDRESS]) {
        log(`[+] Found Secondary UP. Skipping deployments`, VERBOSE);
        erc725_address = config.presets[config.wallets.deploy.address].up[1].ERC725_ADDRESS;
        km_address = config.presets[config.wallets.deploy.address].up[1].KEYMANAGER_ADDRESS;
    } else {
        log(`[+] Deploying Profile`, VERBOSE);
        deployed = await deploy(lspFactory, config);
        if(deployed) {
            erc725_address = deployed.ERC725Account.address;
            km_address = deployed.KeyManager.address;
        } else {
            return;
        }
        
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
async function deploy(lspFactory, config) {
    lspFactory = reinitLspFactory(lspFactory, config);

    let controller_addresses = [
        config.wallets.deploy.address,
        config.wallets.transfer.address
    ];
    try {
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
                },
                // deployReactive: true
            })
            // .subscribe({
            //     next: (deploymentEvent) => {
            //       console.log(deploymentEvent);
            //     },
            //     complete: () => {
            //       console.log('Digital Asset deployment completed');
            //     },
            //   });
    
        return up;
    } catch(e) {
        warn("Error during UP Deployment", INFO);
        console.log(e);
    }
    
}

async function deployLSP8(lspFactory, web3, owner_address, EOA, state) {
    lspFactory = reinitLspFactory(lspFactory, state.config);

    try {
        const lsp8_asset = await lspFactory.LSP8IdentifiableDigitalAsset.deploy({
            name: "My token",
            symbol: "TKN",
            controllerAddress: owner_address, // Account which will own the Token Contract
        },
        {
            deployReactive: state.config.deployReactive,
            deployProxy: state.config.deployProxy
        })

        if(state.config.deployReactive) {
            lsp8_asset.subscribe({
                next: (deploymentEvent) => {
                  console.log(deploymentEvent);
    
                },
                complete: () => {
                    state.deploying = false;
                    console.log('Digital Asset deployment completed');
                    const lsp8 = new web3.eth.Contract(
                        LSP8IdentifiableDigitalAsset.abi,
                        lsp8_asset.LSP8IdentifiableDigitalAsset.address,
                        {
                            from: EOA.deploy.address
                        }
                    );
                },
              });
        } else {
            const lsp8 = new web3.eth.Contract(
                LSP8IdentifiableDigitalAsset.abi,
                lsp8_asset.LSP8IdentifiableDigitalAsset.address,
                {
                    from: EOA.deploy.address
                }
            );
            return lsp8;
        }
        
    
        
        
    } catch (e) {
        warn("Error during LSP8 Deployment", INFO);
    }
    
}

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
        })
        
        const lsp7 = new web3.eth.Contract(
            LSP7Mintable.abi,
            digitalAsset.LSP7DigitalAsset.address,
            {
                from: EOA.deploy.address
            }
        );

        state.deploying = false;

        return lsp7;
    } catch(e) {
        warn("Error during LSP7 Deployment", INFO);
        console.log(e);
    }
    
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
        if(!up[erc725_address]) {
            // state of up is not right. abort
            return;
        }
        km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
        
        await mint(lsp_asset, erc725_address, mint_amt_or_id, {erc725, km}, EOA, state, type.toUpperCase());
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
async function mint(lsp, up_address, amt_or_id, up, EOA, state, type) {
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
        let gasPriceWei = await state.web3.eth.getGasPrice();
        // let gasWei = await up.km.methods.execute(abiPayload).estimateGas()
        
        if(next.gasPrice) {
            log(`Replaying ${nonce} with gasPrice ${gasPrice}`, INFO);
        }

        await up.km.methods.execute(abiPayload).send({
            from: EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice,
            nonce
        })
        .on('transactionHash', function(hash){
            log(`[+] Tx: ${hash} Nonce: ${nonce}`, VERBOSE);
            state.pendingTxs.push({hash, nonce});
        })
        .on('receipt', function(receipt){
            try {
                lsp.methods.totalSupply().call().then((totalSupply) => {
                    log(`Minted ${totalSupply} tokens to ${lsp._address} Nonce ${nonce} Tx ${receipt.transactionHash}`, INFO);
                })
            } catch(e) {
                log(`Minted tokens to ${lsp._address} Nonce ${nonce} Tx ${receipt.transactionHash}`, INFO);
            }
            logTx(config.txTransactionLog, receipt.transactionHash, nonce);
            
            
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            warn(`[!] Minting Error. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
            warn(error, VERBOSE);
            if(error.toString().includes("replacement transaction underpriced")) {
                replayAndIncrementGasPrice(state, nonce, gasPrice);
            }
            let hash = extractHashFromStacktrace(error);
            if (hash) {
                fs.writeFile(config.txErrorLog, hash + "\n", { flag: 'a+' }, err => {
                    if (err) {
                      console.error(err);
                    }
                })
            }
            
            if(receipt) {
                log(receipt, VERBOSE);
            }
        });
        
    } catch(e) {
        warn(`[!] Error during minting. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
        console.log(e);
        if(e.toString().includes("replacement transaction underpriced")) {
            replayAndIncrementGasPrice(state, nonce, gasPrice);
        }
    }
    
}

async function transfer(lsp, _from, _to, amount, up, state, type ) {
    let next, nonce, gasPrice;
    try {
        // function transfer(address from, address to, uint256 amount, bool force, bytes memory data) external;
        let targetPayload = lsp.methods.transfer(_from, _to, amount, false, '0x').encodeABI();
        
        
        let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

        // default gasPrice
        let defaultGasPrice = state.config.defaultGasPrice;

        next = nextNonce(state);
        if(!next) {
            console.log('nothing next?');
        }
        nonce = next.nonce;
        gasPrice = next.gasPrice? next.gasPrice: defaultGasPrice;
        
        log(`[+] Transfering ${type.toUpperCase()} (${nonce})`, VERBOSE);
        log(`[+] Transferring (${nonce}) ${amount} of ${lsp._address} from ${_from} to ${_to}`, DEBUG);
        
        if(next.gasPrice) {
            log(`Replaying ${nonce} with gasPrice ${gasPrice}`, INFO);
        }
        up.km.methods.execute(abiPayload).send({
            from: up.EOA.transfer.address, 
            gas: 5_000_000,
            gasPrice,
            nonce
        })
        .on('transactionHash', function(hash){
            log(`[+] Tx: ${hash} Nonce: ${nonce}`, VERBOSE);
            state.pendingTxs.push({nonce, hash});
        })
        .on('receipt', function(receipt){
            log(`[+] Transfer complete ${receipt.transactionHash} Nonce ${nonce}`, INFO);
            logTx(config.txTransactionLog, receipt.transactionHash, nonce);
        })
        .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            warn(`[!] Transfer Error. Nonce ${nonce}`, INFO);
            log(error, VERBOSE);
            if(error.toString().includes("replacement transaction underpriced")) {
                replayAndIncrementGasPrice(state, nonce, gasPrice);
            }
            let hash = extractHashFromStacktrace(error);
            if (hash) {
                fs.writeFile(config.txErrorLog, hash + "\n", { flag: 'a+' }, err => {
                    if (err) {
                      console.error(err);
                    }
                })
            }
            
            if(receipt) {
                log(receipt, VERBOSE);
                // delete state.pendingTxs[nonce];
            }
        });
    } catch(e) {
        warn(`[!] Error during transfer. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
        console.log(e, INFO);
        if(e.toString().includes("replacement transaction underpriced")) {
            replayAndIncrementGasPrice(state, nonce, gasPrice);
        }
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
    doMint,
    initUP,
}