const crypto = require('crypto');
const fs = require('fs');

const {log, warn, monitor, DEBUG, VERBOSE, INFO, QUIET} = require('./logging');

function nextNonce(state) {
    let nonce;
    let gasPrice = undefined;
    if(state.droppedNonces.length > 0 || state.incrementGasPrice.length > 0) {
        let droppedNonce = state.droppedNonces[0];
        let replacementNonce = state.incrementGasPrice[0] ? state.incrementGasPrice[0].nonce : droppedNonce + 1;
        if(state.incrementGasPrice[0] === undefined) {
            log(`Dropped nonces ${state.droppedNonces.length}`, VERBOSE);
            
        }
        if(droppedNonce < replacementNonce || replacementNonce === undefined) {
            nonce = state.droppedNonces.shift();
        } else {
            let next = state.incrementGasPrice.shift();
            nonce = next.nonce;
            gasPrice = parseInt(next.gasPrice) + parseInt(state.config.gasIncrement);
            gasPrice = gasPrice.toString();
        }
        state.monitor.droppedNonces = { 
            length: state.droppedNonces.amount,
            lowest: state.droppedNonces[0]
        };
        state.monitor.incrementGasPrice = {
            amount: state.incrementGasPrice.length,
            lowest: state.incrementGasPrice[0] ? state.incrementGasPrice[0].nonce : ''
        };
    } else {
        nonce = state.nonce++;
    }
    log(`[+] Sending  tx with nonce ${nonce}`, DEBUG);
    return {nonce, gasPrice};
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
    } else {
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
            sent: 0,
            receipts: 0,
            errors: {
                underpriced: 0,
                transactionReceipt: 0,
                invalidJSON: 0,
                nonceTooLow: 0,
                misc: 0
            },
        },
        networkFailures: {
            econnreset: 0,
            econnrefused: 0,
            socketDisconnectedTLS: 0,
            socketHangUp: 0,
            timedout: 0
        }
    }
}

function monitorCycle(state) {
    monitor(`************************************[*]`);
    monitor(`Tx Sent: ${state.monitor.tx.sent} Max Delay ${state.config.maxDelay}ms Backoff ${state.backoff}ms` );
    monitor(`Successes ${state.monitor.tx.receipts} Pending ${state.pendingTxs.length}`);
    monitor(`Errors: `);
    monitor(`    Underpriced ${state.monitor.tx.errors.underpriced}`);
    monitor(`    Transaction Receipt ${state.monitor.tx.errors.transactionReceipt}`);
    monitor(`    Invalid JSON Response ${state.monitor.tx.errors.invalidJSON}`);
    monitor(`    Nonce too low ${state.monitor.tx.errors.nonceTooLow}`);
    monitor(`    Misc    ${state.monitor.tx.errors.misc}`);
        
    monitor(`Network Failures`);
    monitor(`   Socket Hang up ${state.monitor.networkFailures.socketHangUp}`)
    monitor(`   Disconnected preTLS ${state.monitor.networkFailures.socketDisconnectedTLS}`)
    monitor(`   ECONNRESET ${state.monitor.networkFailures.econnreset}`)
    monitor(`   ECONNREFUSED ${state.monitor.networkFailures.econnrefused}`);
    monitor(`   ETIMEDOUT ${state.monitor.networkFailures.timedout}`)

    monitor(`Nonces: Current ${state.nonce}`);
    monitor(`   Dropped ${state.droppedNonces.length } Next ${state.droppedNonces[0] ? state.droppedNonces[0] : ''}`)
    monitor(`   Incrementing Gas Price ${state.incrementGasPrice.length} Next ${state.incrementGasPrice[0] ? state.incrementGasPrice[0].nonce : ''}`);
    monitor(`************************************[*]`);

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
    savePresets
}