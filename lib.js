const LSPFactory = require('@lukso/lsp-factory.js').LSPFactory;
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8IdentifiableDigitalAsset = require('@lukso/lsp-smart-contracts/artifacts/LSP8IdentifiableDigitalAsset.json');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;
const config = require("./config.json");

const {log, warn, monitor, DEBUG, VERBOSE, INFO, QUIET} = require('./logging');
const { UPState } = require("./state");
const {nextNonce, errorHandler, randomIndex, randomKey, logTx, addNonceToDroppedNoncesIfNotPresent, savePresets, accountForNonce, storeSentNonce } = require("./utils");

const OPERATION_CALL = 0;

class UPLib extends UPState {
    constructor() {
        super();
    }

    reinitLspFactory = function (lspFactory, config) {
        return lspFactory;
        lspFactory = new LSPFactory(lspFactory.options.provider, {
            deployKey: config.wallets.deploy.privateKey, // Private key of the account which will deploy UPs
            chainId: config.chainId // Chain Id of the network you want to connect to
          });
        return lspFactory;
    }

    initUP = async function () {
        let state = this.state;
        let {lspFactory, web3, config } = state;

        lspFactory = this.reinitLspFactory(lspFactory, config);

        let erc725_address, erc725;
        let km_address, km;
        
        
        this.log(`Deploying Profile`, INFO, state);
        let deployed = await this.deploy(lspFactory, config, state);
        if(deployed) {
            erc725_address = deployed.LSP0ERC725Account.address;
            km_address = deployed.LSP6KeyManager.address;
        } else {
            return;
        }
        

        this.log(`ERC725 address:     ${erc725_address}`, INFO, state);
        this.log(`KeyManager address: ${km_address}`, INFO, state);
        erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
        km = new web3.eth.Contract(KeyManager.abi, km_address);
        state.up[erc725_address] = {
            erc725,
            km
        }
        if(state.config.savePresets) {
            savePresets(state, state.config.presetsFile);
        }
    }

    // Deploy LSP3 Account
    deploy = async function (lspFactory, config) {
        let state = this.state;
        lspFactory = this.reinitLspFactory(lspFactory, config);

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
            this.warn("Error during UP Deployment", INFO, state);
            console.log(e);
        }
        
    }

    deployLSP8 = async function (lspFactory, web3, owner_address, EOA) {
        let state = this.state;
        lspFactory = this.reinitLspFactory(lspFactory, state.config);

        try {
            const lsp8_asset = await lspFactory.LSP8IdentifiableDigitalAsset.deploy({
                name: "My token",
                symbol: "TKN",
                controllerAddress: owner_address, // Account which will own the Token Contract
            },
            {
                deployProxy: state.config.deployProxy
            }).catch((e) => {
                this.warn(e.toString().substring(0,100), INFO, state);
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
            this.warn("Error during LSP8 Deployment", INFO, state);
        }
        
    }

    deployLSP7 = async function (lspFactory, web3, owner_address, EOA) {
        let state = this.state;
        lspFactory = this.reinitLspFactory(lspFactory, state.config);
     
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
                this.warn(e.toString().substring(0,100), INFO, state);
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
            this.warn("Error during LSP7 Deployment", INFO);
            this.warn(e, INFO);
        }
        
    }

    attemptMint = async function (type, abi) {
        let state = this.state;
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
            
            this.mint(lsp_asset, erc725_address, mint_amt_or_id, {erc725, km}, EOA, type.toUpperCase());
            // 
            

            // should remove the following. we cannot keep track of the state of the train locally
            // if(type==='lsp7') {
            //     state[type].addresses[asset_address].totalSupply += mint_amt_or_id;
            // } else {
            //     state[type].addresses[asset_address].totalSupply += 1;
            // }
            
        } else {
            warn(`[!] No ${type} to mint`, INFO);
        }
    }

    //https://docs.lukso.tech/guides/assets/create-lsp7-digital-asset/
    mint = async function (lsp, up_address, amt_or_id, up, EOA, type) {
        let state = this.state;
        let next, nonce, gasPrice;
        try {
            let targetPayload = await lsp.methods.mint(up_address, amt_or_id, false, '0x').encodeABI();
            
            let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp._address, 0, targetPayload).encodeABI();

            // default gasPrice
            let defaultGasPrice = state.config.defaultGasPrice;

            next = nextNonce(state);
            nonce = next.nonce;
            gasPrice = next.gasPrice? next.gasPrice: defaultGasPrice;

            this.log(`[+] Minting more ${type} (${nonce})`, VERBOSE);
            // let gasPriceWei = await state.web3.eth.getGasPrice();
            // let gasWei = await up.km.methods.execute(abiPayload).estimateGas()
            
            if(next.gasPrice) {
                this.log(`Replaying ${nonce} with gasPrice ${gasPrice}`, INFO);
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
                this.log(`[+] Tx: ${hash} Nonce: ${nonce}`, VERBOSE);
                state.pendingTxs[hash] = nonce;
                state.monitor.tx.hash++;
                accountForNonce(state, nonce);
            })
            .on('receipt', function(receipt){
                this.log(`Minted tokens ${receipt.transactionHash} to ${lsp._address} Nonce ${nonce} `, INFO);
                state[type.toLowerCase()].transferable = true;
                state.monitor.tx.receipts.mints++;
                if(state.config.logTx) {
                    logTx(state.config.txTransactionLog, receipt.transactionHash, nonce);
                }
                accountForNonce(state, nonce);
            })
            .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
                this.warn(`[!] Minting Error. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
                accountForNonce(state, nonce);
                this.warn(error, VERBOSE);
                errorHandler(state, error, nonce, receipt, gasPrice);
            });
            
        } catch(e) {
            this.warn(`Error during minting. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
            // console.log(e);
            accountForNonce(state, nonce); 
            errorHandler(state, e, nonce, null, gasPrice);
        }
        
    }

    transfer = async function (lsp, _from, _to, amount, up, type ) {
        let state = this.state;
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
            
            this.log(`Transfering ${type.toUpperCase()} (${nonce})`, VERBOSE);
            this.log(`Transferring (${nonce}) ${amount} of ${lsp._address} from ${_from} to ${_to}`, DEBUG);
            
            if(next.gasPrice) {
                this.log(`Replaying ${nonce} with gasPrice ${gasPrice}`, INFO);
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
                this.log(`Tx: ${hash} Nonce: ${nonce}`, VERBOSE);
                state.pendingTxs[hash] = nonce;
                state.monitor.tx.hash++;
                accountForNonce(state, nonce);
            })
            .on('receipt', function(receipt){
                this.log(`Transfer complete ${receipt.transactionHash} Nonce ${nonce}`, INFO);
                if(state.config.logTx) {
                    logTx(state.config.txTransactionLog, receipt.transactionHash, nonce);
                }
                state.monitor.tx.receipts.transfers++;
                accountForNonce(state, nonce);
            })
            .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
                this.warn(`Transfer Error. Nonce ${nonce}`, INFO);
                this.log(error, VERBOSE);
                accountForNonce(state, nonce);
                errorHandler(state, error, nonce, receipt, gasPrice);
            
            });
        } catch(e) {
            this.warn(`Error during transfer. Nonce ${nonce} GasPrice ${gasPrice}`, INFO);
            console.log(e, VERBOSE);
            accountForNonce(state, nonce);
            errorHandler(state, e, nonce, null, gasPrice);
        
        }
        
    }
}

module.exports = {
    UPLib,
    // mint,
    // deploy,
    // deployLSP7,
    // deployLSP8,
    // transfer,
    randomIndex,
    randomKey,
    // attemptMint,
    // initUP,
    addNonceToDroppedNoncesIfNotPresent
}