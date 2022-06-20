const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');

const {log, warn, monitor, DEBUG, VERBOSE, INFO, MONITOR, QUIET} = require('./logging');

function nextNonce(state) {
    let nonce;
    let gasPrice = undefined;
    // we prefer droppedNonces over incrementGasPrice because the droppedNonce might be a lost nonceFromChain
    if(state.droppedNonces.length > 0) {
        nonce = state.droppedNonces.shift();
        // check if the nonce we pulled from the queue is less than the nonce the chain says we have
        // if its less, then there is no point in sending that nonce, as will cause more replacement errors
        // this means we have still removed a nonce from the queue, but discarded if new information is available
        if(nonce < state.nonceFromChain) {
            nonce = state.nonce++;
        }
        state.monitor.droppedNonces = { 
            length: state.droppedNonces.amount,
        };
    } else if(state.incrementGasPrice.length > 0) {
        // let droppedNonce = state.droppedNonces[0];
        // let replacementNonce = state.incrementGasPrice[0] ? state.incrementGasPrice[0].nonce : droppedNonce + 1;
        // if(state.incrementGasPrice[0] === undefined) {
        //     log(`Dropped nonces ${state.droppedNonces.length}`, VERBOSE);
            
        // }
        // we prefer the lesser of the two nonces
        // if(droppedNonce < replacementNonce || replacementNonce === undefined) {
        // if(droppedNonce) {
            
        let next = state.incrementGasPrice.shift();
        nonce = next.nonce;
        if(!next.gasPrice) {
            console.log(next.gasPrice);
        }
        gasPrice = parseInt(next.gasPrice) + parseInt(state.config.gasIncrement);
        gasPrice = gasPrice.toString();
        
        state.monitor.incrementGasPrice = {
            amount: state.incrementGasPrice.length,
        };
    } else {
        nonce = state.nonce++;
    }
    log(`[+] Sending  tx with nonce ${nonce}`, DEBUG);
    return {nonce, gasPrice};
}

function storeSentNonce(state, nonce) {
    state.sentNonces.push(nonce);
    state.sentNonces.sort();
}

/**
 * 
 * @param {*} state 
 * @param {*} nonce 
 * This function removes nonces from the sentNonces array. It means that we have received confirmation 
 * that the TX that was sent with that nonce did not get lost due to some network failure
 */
function accountForNonce(state, nonce) {
    let index = state.sentNonces.indexOf(nonce);
    if(index > -1) {
        state.sentNonces.splice(index, 1);
    }
}

function addNonceToDroppedNoncesIfNotPresent(state, nonce) {
    if(state.droppedNonces.indexOf(nonce) >= 0) {  return; }
    state.droppedNonces.push(nonce);
    state.droppedNonces.sort();
}

function replayAndIncrementGasPrice(state, nonce, gasPrice) {
    // first check if the nonce is already here
    // if it is, update the gasPrice
    for(let i=0; i<state.incrementGasPrice.length; i++) {
        if(state.incrementGasPrice[i].nonce === nonce) {
            state.incrementGasPrice[i].gasPrice = gasPrice;
            return;
        }
    }
    // if it is not already present, add it and sort.
    state.incrementGasPrice.push({nonce, gasPrice});
    state.incrementGasPrice.sort((a, b) => {
        if(a.nonce < b.nonce) return -1;
        if(a.nonce > b.nonce) return 0;
        return 0;
    });
}

function extractHashFromStacktrace(error) {
    let startIdx = error.stack.indexOf("{");
    let endIdx = error.stack.lastIndexOf("}") + 1;
    let parsed;
    try {
        parsed = JSON.parse(error.stack.slice(startIdx, endIdx));
    } catch(e) {
        return false;
    }
    
    return parsed.transactionHash;
}

function logTx(txLogFile, hash, nonce) {
    fs.writeFile(txLogFile, `${hash} ${nonce} \n`, { flag: 'a+' }, err => {
        if (err) {
          console.error(err);
        }
    })
}

function randomIndex(obj) {
    return crypto.randomInt(Object.keys(obj).length);
}

function randomKey(obj) {
    let idx = randomIndex(obj);
    return Object.keys(obj)[idx];
}

function backoff(state) {
    if(state.backoff > 0) { return; }
    state.backoff = state.config.backoff;
}

function errorHandler(state, error, nonce, receipt, gasPrice) {
    // Transaction was not mined within 750 seconds
    if(error.toString().includes("replacement transaction underpriced")) {
        state.monitor.tx.errors.underpriced++;
        replayAndIncrementGasPrice(state, nonce, gasPrice);
    } else if(error.toString().includes("Failed to check for transaction receipt")) {
        warn(error, VERBOSE);
        backoff(state);
        addNonceToDroppedNoncesIfNotPresent(state, nonce);
        state.monitor.tx.errors.transactionReceipt++;
    } else if(error.toString().includes("Invalid JSON RPC response")) {
        warn(error, VERBOSE);
        backoff(state);
        state.monitor.tx.errors.invalidJSON++;
    } else if(error.toString().includes("nonce too low")) {
        state.monitor.tx.errors.nonceTooLow++;
    } else if(error.toString().includes("Transaction has been reverted")) {
        state.monitor.tx.receipts.reverts++;
    } else if(error.toString().includes("Transaction was not mined")) {
        state.monitor.tx.errors.txNotMined++;
    } else {
        warn(error, MONITOR); // setting this to monitor so we can see it in monitor mode
        state.monitor.tx.errors.misc++;
    }
    let hash = extractHashFromStacktrace(error);
    if (hash) {
        fs.writeFile(state.config.txErrorLog, hash + "\n", { flag: 'a+' }, err => {
            if (err) {
              console.error(err);
            }
        })
    }
    
    if(receipt) {
        log(receipt, VERBOSE);
    }
}

function resetMonitor() {
    return {
        droppedNonces: {
            amount: 0,
            lowest: undefined
        },
        incrementGasPrice: {
            amount: 0,
            lowest: undefined
        },
        tx: {
            loop: 0,
            sent: 0,
            checkPending: 0,
            receipts: {
                transfers: 0,
                mints: 0,
                reverts: 0
            },
            mint: 0,
            attemptedTx: 0,
            attemptedMint: 0,
            hash: 0,
            errors: {
                underpriced: 0,
                transactionReceipt: 0,
                invalidJSON: 0,
                nonceTooLow: 0,
                txNotMined: 0,
                misc: 0
            },
        },
        networkFailures: {
            econnreset: 0,
            econnrefused: 0,
            enotfound: 0,
            socketDisconnectedTLS: 0,
            socketHangUp: 0,
            timedout: 0
        }
    }
}

function formatNonces(nonces) {
    let output = "";
    let max = 3;
    let loopMax = nonces.length > max ? max : nonces.length;
    for(let i=0; i<loopMax; i++) {
        output += `${nonces[i]}, `;
    }
    return output;
}

async function fund(state) {
    let address = state.config.wallets.transfer.address;
    axios
        .post(state.config.faucet, {receiver: address})
        .then(res => {
        //   console.log(`statusCode: ${res.status}`);
        // //   console.log(res.data);
        //   let data = res.data;
        //   if( data.error) {
        //       console.log(`[!] ${address} ${data.error.message}`);
        //     //   failed.push(address);
        //   } else if(data.success) {
        //       console.log(`[+] ${address} ${data.success.message}`);
              
        //   }
        })
        .catch(error => {
          console.error(error);
        });
}

function monitorCycle(state) {
    let totalReceipts = state.monitor.tx.receipts.transfers + state.monitor.tx.receipts.mints + state.monitor.tx.receipts.reverts;
    let realTx = state.monitor.tx.sent + state.monitor.tx.mint;
    let txLoopRatio = ((realTx / state.monitor.tx.loop) * 100).toFixed(1);
    let totalErrors = state.monitor.tx.errors.underpriced + state.monitor.tx.errors.transactionReceipt + state.monitor.tx.errors.invalidJSON + state.monitor.tx.errors.nonceTooLow
    let unaccountedFor = formatNonces(state.sentNonces);
    let droppedNonces = formatNonces(state.droppedNonces);
    let incrementGasPriceNonces = formatNonces(state.incrementGasPrice.map(tx => tx.nonce));
    let pendingNonces = Object.values(state.pendingTxs).sort();
    let pendingNoncesFormatted = formatNonces(pendingNonces);
    
    monitor(`************************************[*]************************************[*]`);
    monitor([`Max Delay ${state.config.maxDelay}ms`, `Backoff ${state.backoff}ms`, `Tx Balance ${state.balance}`]);
    monitor([`Tx Total`, `${realTx}`, `Cycles`, `${state.monitor.tx.loop}`, `Ratio`, `${txLoopRatio}%`, `Chk Pending `, `${state.monitor.tx.checkPending}`]); 
    monitor([`Transfer`, `${state.monitor.tx.sent}`, `Attempted`, `${state.monitor.tx.attemptedTx}`]);
    monitor([`    Mint`, `${state.monitor.tx.mint}`,  `Attempted`, `${state.monitor.tx.attemptedMint}` ]);
    monitor([`Receipts`, `${totalReceipts}`, `Pending`, `${Object.keys(state.pendingTxs).length}`, `Tx Hashes`, `${state.monitor.tx.hash}`]);
    monitor([`    Transfers`, `${state.monitor.tx.receipts.transfers}`, `Mints`, `${state.monitor.tx.receipts.mints}`, `Reverts ${state.monitor.tx.receipts.reverts}`])
    monitor(`Errors ${totalErrors}`);
    monitor([`    Underpriced`, `${state.monitor.tx.errors.underpriced}`,             `TX Receipt`, `${state.monitor.tx.errors.transactionReceipt}`]);
    monitor([`    Invalid JSON`, `${state.monitor.tx.errors.invalidJSON}`,   `Nonce too low`, `${state.monitor.tx.errors.nonceTooLow}`]);
    monitor([`    Tx Not Mined`, `${state.monitor.tx.errors.txNotMined}`,             `Misc`, `${state.monitor.tx.errors.misc}`]);
        
    monitor(`Network Failures`);
    monitor([`   Socket Hang up`, `${state.monitor.networkFailures.socketHangUp}`,    `Disconnect preTLS`, `${state.monitor.networkFailures.socketDisconnectedTLS}`])
    monitor([`   ECONNRESET`, `${state.monitor.networkFailures.econnreset}`,          `ECONNREFUSED`, `${state.monitor.networkFailures.econnrefused}`])
    monitor([`   ETIMEDOUT`, `${state.monitor.networkFailures.timedout}`,             `ENOTFOUND`, `${state.monitor.networkFailures.enotfound}`])           

    monitor([`Nonces:`, `Current`, `${state.nonce}`, `From Chain `, `${state.nonceFromChain}`, `Divergence `, `${state.nonce - state.nonceFromChain}`]);
    monitor([`   Dropped`, `${state.droppedNonces.length }`,                  `[${droppedNonces}...]`])
    monitor([`   Increment Gas Price`, `${state.incrementGasPrice.length}`, `[${incrementGasPriceNonces}...]`]);
    monitor([`   Unaccounted`, `${state.sentNonces.length}`,                  `[${unaccountedFor}...] `]);
    monitor([`   Pending`, `${pendingNonces.length}`, `[${pendingNoncesFormatted}...]`]);
    monitor(`************************************[*]************************************[*]`);

    state.monitor = resetMonitor();
}

function alreadySavedUP(presets, up) {
    let saved = false;
    for(preset in presets) {
        if (presets[preset].ERC725_ADDRESS === up.ERC725_ADDRESS || presets[preset].KEYMANAGER_ADDRESS === up.KEYMANAGER_ADDRESS) {
            saved = true;
            return saved;
        }
    }
    return saved;
}

function alreadySavedLSP(presets, lsp) {
    let saved = false;
    for(p in presets) {
        if (presets[p] === lsp) {
            saved = true;
            return saved;
        }
    }
    return saved;
}

function savePresets(state, presetsFile) {
    let presets = state.config.presets;
    let deployKey = state.config.wallets.deploy.address;
    if(!presets[deployKey]) {
        presets[deployKey] = {
            "up": [],
            "lsp7": [],
            "lsp8": []
        }
    }
    for(key in state.up) {
        let erc725address = key;
        let kmAddress = state.up[key].km._address;
        let up = {
            "ERC725_ADDRESS": erc725address,
            "KEYMANAGER_ADDRESS": kmAddress
        };
        if(!alreadySavedUP(presets[deployKey].up, up)) {
            presets[deployKey].up.push(up)
        }
    }

    for(lsp7 in state.lsp7.addresses) {
        if(!alreadySavedLSP(presets[deployKey].lsp7, lsp7)) {
            presets[deployKey].lsp7.push(lsp7);
        }
    }

    for(lsp8 in state.lsp8.addresses) {
        if(!alreadySavedLSP(presets[deployKey].lsp8, lsp8)) {
            presets[deployKey].lsp8.push(lsp8);
        }
    }

    let serialized = JSON.stringify(presets);
    fs.writeFile(presetsFile, serialized, err => {
        if (err) {
          console.error(err);
        }
    })

}


module.exports = {
    nextNonce,
    replayAndIncrementGasPrice,
    extractHashFromStacktrace,
    randomIndex,
    randomKey,
    logTx,
    backoff,
    addNonceToDroppedNoncesIfNotPresent,
    monitorCycle,
    resetMonitor,
    errorHandler,
    savePresets,
    accountForNonce,
    storeSentNonce,
    fund
}