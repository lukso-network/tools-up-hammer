const crypto = require('crypto');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP8Mintable.json');
const { UPLib, randomKey } = require('./lib');

const {log, warn, monitor, DEBUG, VERBOSE, INFO, QUIET} = require('./logging');
const {savePresets, errorHandler, whichWeb3} = require("./utils");
class UPActions extends UPLib {
    constructor() {
        super();
    }

    loop_deployUP = async function () {
        let state = this.state;
        if(Object.keys(state.up).length < state.config.deployLimits.up) {
            this.log(`Deploying new UP`, INFO, state);
            let {lspFactory, web3, EOA, up, config} = state;
            let erc725, km;
            let erc725_address, km_address;
            if(state.config.presets[EOA.deploy.address]
                && Object.keys(up).length < Object.keys(state.config.presets[EOA.deploy.address].up).length) 
            {
                let preset = Object.keys(up).length;
                erc725_address = config.presets[config.wallets.deploy.address].up[preset].ERC725_ADDRESS;
                km_address = config.presets[config.wallets.deploy.address].up[preset].KEYMANAGER_ADDRESS
                erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
                km = new web3.eth.Contract(KeyManager.abi, km_address);
            } else {
                let deployed = await this.deploy(lspFactory, config);
                if(deployed) {
                    erc725_address = deployed.LSP0ERC725Account.address;
                    km_address = deployed.LSP6KeyManager.address;
                } else {
                    return;
                }
            }
            
            
            
                
            this.log(`ERC725 address:     ${erc725_address}`, INFO);
            this.log(`KeyManager address: ${km_address}`, INFO);
            erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
            km = new web3.eth.Contract(KeyManager.abi, km_address);
            this.state.up[erc725_address] = {
                erc725,
                km
            }
            if(state.config.savePresets) {
                savePresets(state, state.config.presetsFile);
            }
            
            
        }
    }

    loop_deployLSP7 = async function () {
        let state = this.state;
        let config = state.config;
        if(Object.keys(state.lsp7.addresses).length < config.deployLimits.lsp7) {
            this.log(`Deploying new LSP7`, INFO, state);
            let {lspFactory, web3, EOA, up, lsp7} = state;
            let lsp7_asset, erc725_address;
    
            if(Object.keys(up).length == 0 ) {
                return;
            }
            erc725_address = randomKey(up); 
            lsp7_asset = await this.deployLSP7(lspFactory, web3, erc725_address, EOA, state);
        
            if(lsp7_asset) {
                this.log(`LSP7 address:       ${lsp7_asset._address}`, INFO);
                this.state.lsp7.addresses[lsp7_asset._address] = {
                    owner: erc725_address,
                    totalSupply: 0,
                }
                if(state.config.savePresets) {
                    savePresets(state, state.config.presetsFile);
                }
            }
            
        }
        

    }

    loop_deployLSP8 = async function () {
        let state = this.state;
        let config = state.config;
        if(Object.keys(state.lsp8.addresses).length < config.deployLimits.lsp8) {
            this.log(`Deploying new LSP8`, INFO, state);
            let {lspFactory, web3, EOA, up, lsp8} = state;
            let lsp8_asset, erc725_address
            let totalSupply = 0; 
            let currentId = 0;

            if(config.presets[config.wallets.deploy.address] &&
                Object.keys(lsp8.addresses).length < config.presets[config.wallets.deploy.address].lsp8.length) {
                let preset = Object.keys(lsp8.addresses).length;
                lsp8_asset = new web3.eth.Contract(LSP7Mintable.abi, config.presets[config.wallets.deploy.address].lsp8[preset]);
                erc725_address = await lsp8_asset.methods.owner().call();
                totalSupply = await lsp8_asset.methods.totalSupply().call();
                currentId = totalSupply;
            } else {
                erc725_address = randomKey(up); 
                lsp8_asset = await this.deployLSP8(lspFactory, web3, erc725_address, EOA, state, 
                    function(lsp8_asset) {
                        this.log(`LSP8 address:       ${lsp8_asset._address}`, INFO);
                    
                        this.state.lsp8.addresses[lsp8_asset._address] = {
                            owner: erc725_address,
                            totalSupply,
                            currentId
                        } 
                    });

            }

            if (lsp8_asset) {
                this.log(`LSP8 address:       ${lsp8_asset._address}`, INFO);
            
                this.state.lsp8.addresses[lsp8_asset._address] = {
                    owner: erc725_address,
                    totalSupply,
                    currentId
                } 
                if(state.config.savePresets) {
                    savePresets(state, state.config.presetsFile);
                }
            }
            
        }

    }

    loop_mintLSP7 = async function () {
        let state = this.state;
        if(Object.keys(state.lsp7.addresses).length > 0) {
            this.attemptMint('lsp7', LSP7Mintable.abi, state);
        } else {
            this.warn('No LSP7 to mint', VERBOSE);
        }
        
    }
    loop_mintLSP8 = async function () {
        let state = this.state;
        if(Object.keys(state.lsp8.addresses).length > 0) {
            this.attemptMint('lsp8', LSP8Mintable.abi, state);
        } else {
            this.warn('No LSP8 to Mint', VERBOSE);
        }
    }

    loop_transferLSP7 = async function () {
        
        this.attemptTransferLSP7(undefined);
    }

    loop_transferAllLSP7 = async function () {
        this.attemptTransferLSP7('all');
    }

    attemptTransferLSP7 = async function (tx_amt_type) {
        let state = this.state;
        let {EOA, up, lsp7} = state;
        let web3 = whichWeb3(state);
        try {
            state.monitor.tx.attemptedTx++;
            if(lsp7.transferable) {
                let amount;
                let lsp7_asset;

                // here we should not care if there are tokens minted to the LSP7
                let lsp7_address = randomKey(lsp7.addresses);
                lsp7_asset = new web3.eth.Contract(LSP7Mintable.abi, lsp7_address);
                
                let erc725_address;
                erc725_address = randomKey(up);
                
                let sending_address = erc725_address;
                
                lsp7_asset.methods.balanceOf(erc725_address).call().then((sender_balance) => {
                    this.log(`[+] Sender ${sending_address} has balance of ${sender_balance} tokens`, VERBOSE);   
                    
                    if(sender_balance === "0") {
                        // if the senders balance is empty, we can attempt a revert by sending 1
                        sender_balance = 1;
                    };
                
                    if(tx_amt_type === 'all') {
                        // this could still be inaccurate, because between the time the call was made, another transfer COULD have been mined
                        amount = parseInt(sender_balance);
                    } else {
                        amount = crypto.randomInt(parseInt(sender_balance));
                    }

                    // with an unknown amount of UPs, select a destination randomly
                    let recv_address = sending_address;
                    while(recv_address === sending_address)
                    {
                        // loop until we find an address that is not the sender
                        recv_address = randomKey(up);
                    }
                    this.log(`Receiver will be ${recv_address}`, DEBUG);

                    erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
                    km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
                
                    this.transfer(lsp7_asset, sending_address, recv_address, amount, {erc725, km, EOA}, state, 'lsp7')
                    
                }).catch((e) => {
                    // console.log(e);
                    errorHandler(state, e);
                });     
            } else {
                this.warn('No LSP7 to Transfer', DEBUG);
            }
        } catch(e) {
            this.warn("ERROR when transfering LSP7", INFO);
            this.warn(e, INFO);
            errorHandler(state, e);
        }
    }

    loop_transferLSP8 = async function () {
        let state = this.state;
        this.log(`[+] Transfering LSP8`, DEBUG);
        let {EOA, up, lsp8} = state;
        let web3 = whichWeb3(state);
        try {
            state.monitor.tx.attemptedTx++;
            if(lsp8.transferable) {
                let totalSupply = "0";
                let lsp8_contract, lsp8_address;
                let tokenId, tokenIdBytes;
                let owner;
                let keepSearching = true;
            
                lsp8_address = randomKey(lsp8.addresses);
                lsp8_contract = new web3.eth.Contract(LSP8Mintable.abi, lsp8_address);
                lsp8_contract.methods.totalSupply().call().then(totalSupply => {
                    // if there are no tokens we will send tokenId 1 and force a revert
                    if(totalSupply === "0") {
                        totalSupply = "1";
                    }
                    tokenId = parseInt(crypto.randomInt(parseInt(totalSupply))) + 1; // prevent id from being 0
                    tokenIdBytes = web3.utils.toHex(tokenId);

                    // find out who owns it
                    lsp8_contract.methods.tokenOwnerOf(tokenIdBytes).call().then(owner => {
                        // there is a chance that the preset for the LSP8 has been loaded before the UP
                        // that owns it, so check that `owner` is present in `up` state before proceeding
                        if(!up[owner]) { 
                            return; 
                        }
                        this.log(`[+] Sender ${owner} owns ${tokenIdBytes} token`, DEBUG);

                        // select a random recipient
                        let recv_address = owner;
                        while(recv_address === owner)
                        {
                            // loop until we find an address that is not the sender
                            // let other_idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
                            // recv_address = Object.keys(up)[other_idx];
                            recv_address = randomKey(up);
                        }
                        this.log(`[+] Receiver will be ${recv_address}`, DEBUG);
            
                        // send
                        erc725 = new web3.eth.Contract(UniversalProfile.abi, owner);
                        km = new web3.eth.Contract(KeyManager.abi, up[owner].km._address);
                        this.log(`[+] Transferring ${tokenIdBytes} of ${lsp8_contract._address} from ${owner} to ${recv_address}`, DEBUG);
                        
                        this.transfer(lsp8_contract, owner, recv_address, tokenIdBytes, {erc725, km, EOA}, state, 'lsp8');
                    
                    });  
                })
            } else {
                this.warn('[!] No LSP8 to transfer', DEBUG);
            }        
        } catch(e) {
            this.warn("ERROR when transferring LSP8", INFO);
            // console.log(e);
            errorHandler(state, e);
        }
        
    }
}

module.exports = {
    UPActions
}