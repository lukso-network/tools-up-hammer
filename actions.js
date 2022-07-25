const crypto = require('crypto');
const UniversalProfile = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const LSP8Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP8Mintable.json');
const { deploy, deployLSP7, deployLSP8, transfer, randomKey, attemptMint } = require('./lib');

const {log, warn, monitor, DEBUG, VERBOSE, INFO, QUIET} = require('./logging');
const {savePresets, errorHandler, whichWeb3} = require("./utils");

async function loop_deployUP(state) {
    if(Object.keys(state.up).length < state.config.deployLimits.up) {
        log(`Deploying new UP`, INFO);
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
            let deployed = await deploy(lspFactory, config);
            if(deployed) {
                erc725_address = deployed.ERC725Account.address;
                km_address = deployed.KeyManager.address;
            } else {
                return;
            }
        }
        
        
        
            
        log(`ERC725 address:     ${erc725_address}`, INFO);
        log(`KeyManager address: ${km_address}`, INFO);
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
}
async function loop_deployLSP7(state) {
    let config = state.config;
    if(Object.keys(state.lsp7.addresses).length < config.deployLimits.lsp7) {
        log(`Deploying new LSP7`, INFO);
        let {lspFactory, web3, EOA, up, lsp7} = state;
        let lsp7_asset, erc725_address;

        if(config.presets[config.wallets.deploy.address] &&
            Object.keys(lsp7.addresses).length < config.presets[config.wallets.deploy.address].lsp7.length) {
            let preset = Object.keys(lsp7.addresses).length;
            lsp7_asset = new web3.eth.Contract(LSP7Mintable.abi, config.presets[config.wallets.deploy.address].lsp7[preset]);
            try {
                erc725_address = await lsp7_asset.methods.owner().call();
            } catch(e) {
                console.log(e);
            }
            
        } else {
            if(Object.keys(up).length == 0 ) {
                return;
            }
            erc725_address = randomKey(up); 
            lsp7_asset = await deployLSP7(lspFactory, web3, erc725_address, EOA, state);
        }

        if(lsp7_asset) {
            log(`LSP7 address:       ${lsp7_asset._address}`, INFO);
            state.lsp7.addresses[lsp7_asset._address] = {
                owner: erc725_address,
                totalSupply: 0,
            }
            if(state.config.savePresets) {
                savePresets(state, state.config.presetsFile);
            }
        }
        
    }
    

}
async function loop_deployLSP8(state) {
    let config = state.config;
    if(Object.keys(state.lsp8.addresses).length < config.deployLimits.lsp8) {
        log(`Deploying new LSP8`, INFO);
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
            lsp8_asset = await deployLSP8(lspFactory, web3, erc725_address, EOA, state, 
                function(lsp8_asset) {
                    log(`LSP8 address:       ${lsp8_asset._address}`, INFO);
                
                    state.lsp8.addresses[lsp8_asset._address] = {
                        owner: erc725_address,
                        totalSupply,
                        currentId
                    } 
                });

        }

        if (lsp8_asset) {
            log(`LSP8 address:       ${lsp8_asset._address}`, INFO);
        
            state.lsp8.addresses[lsp8_asset._address] = {
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
async function loop_mintLSP7(state) {
    if(Object.keys(state.lsp7.addresses).length > 0) {
        await attemptMint('lsp7', LSP7Mintable.abi, state);
    } else {
       warn('No LSP7 to mint', VERBOSE);
    }
    
}
async function loop_mintLSP8(state) {
    
    if(Object.keys(state.lsp8.addresses).length > 0) {
        await attemptMint('lsp8', LSP8Mintable.abi, state);
    } else {
        warn('No LSP8 to Mint', VERBOSE);
    }
}

async function loop_transferLSP7(state) {
    attemptTransferLSP7(state, undefined);
}

async function loop_transferAllLSP7(state) {
    attemptTransferLSP7(state, 'all');
}

async function attemptTransferLSP7(state, tx_amt_type) {
    
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
                log(`[+] Sender ${sending_address} has balance of ${sender_balance} tokens`, VERBOSE);   
                
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
                log(`Receiver will be ${recv_address}`, DEBUG);

                erc725 = new web3.eth.Contract(UniversalProfile.abi, erc725_address);
                km = new web3.eth.Contract(KeyManager.abi, up[erc725_address].km._address);
            
                transfer(lsp7_asset, sending_address, recv_address, amount, {erc725, km, EOA}, state, 'lsp7')
                
            }).catch((e) => {
                // console.log(e);
                errorHandler(state, e);
            });     
        } else {
            warn('No LSP7 to Transfer', DEBUG);
        }
    } catch(e) {
        warn("ERROR when transfering LSP7", INFO);
        warn(e, INFO);
        errorHandler(state, e);
    }
    
}


async function loop_transferLSP8(state) {
    log(`[+] Transfering LSP8`, DEBUG);
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
            // as long as one lsp8 assets has a totalSupply >= transfer amount, this won't get stuck
            // need to ensure that condition is always met
            // additionally, if using presets, the LSP8 owner could be a UP that has not been loaded in yet
            while(keepSearching) {
                lsp8_address = randomKey(lsp8.addresses);
                lsp8_contract = new web3.eth.Contract(LSP8Mintable.abi, lsp8_address);
                totalSupply = await lsp8_contract.methods.totalSupply().call();

                // select a random token from the supply
                if(totalSupply === "0") {
                    continue;
                }
                tokenId = parseInt(crypto.randomInt(parseInt(totalSupply))) + 1; // prevent id from being 0
                tokenIdBytes = web3.utils.toHex(tokenId);

                // find out who owns it
                owner = await lsp8_contract.methods.tokenOwnerOf(tokenIdBytes).call();
                // console.log(owner)
                // super hacky way since the while loop was exiting even though both conditions weren't met
                if(totalSupply !== "0" && up[owner] !== undefined) {
                    keepSearching = false;
                }
                
            }
            
            log(`[+] Sender ${owner} owns ${tokenIdBytes} token`, DEBUG);

            // select a random recipient
            let recv_address = owner;
            while(recv_address === owner)
            {
                // loop until we find an address that is not the sender
                // let other_idx = crypto.randomBytes(1)[0] % Object.keys(up).length;
                // recv_address = Object.keys(up)[other_idx];
                recv_address = randomKey(up);
            }
            log(`[+] Receiver will be ${recv_address}`, DEBUG);

            // send
            erc725 = new web3.eth.Contract(UniversalProfile.abi, owner);
            km = new web3.eth.Contract(KeyManager.abi, up[owner].km._address);
            log(`[+] Transferring ${tokenIdBytes} of ${lsp8_contract._address} from ${owner} to ${recv_address}`, DEBUG);
            
            transfer(lsp8_contract, owner, recv_address, tokenIdBytes, {erc725, km, EOA}, state, 'lsp8');
        
        } else {
            warn('[!] No LSP8 to transfer', DEBUG);
        }
    } catch(e) {
        warn("ERROR when transferring LSP8", INFO);
        // console.log(e);
        errorHandler(state, e);
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