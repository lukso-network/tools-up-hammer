const crypto = require('crypto');
const log = require("./logging").log;
const warn = require("./logging").warn;
const DEBUG = require("./logging").DEBUG;
const VERBOSE = require("./logging").VERBOSE;
const INFO = require("./logging").INFO;
const QUIET = require("./logging").QUIET

function nextNonce(state) {
    let nonce;
    let gasPrice = undefined;
    if(state.droppedNonces.length > 0 || state.incrementGasPrice.length > 0) {
        let droppedNonce = state.droppedNonces[0];
        let replacementNonce = state.incrementGasPrice[0] ? state.incrementGasPrice[0].nonce : droppedNonce + 1;
        if(state.incrementGasPrice[0] === undefined) {
            console.log(`Dropped nonces ${state.droppedNonces.length}`);
        }
        if(droppedNonce < replacementNonce || replacementNonce === undefined) {
            nonce = state.droppedNonces.shift();
        } else {
            let next = state.incrementGasPrice.shift();
            nonce = next.nonce;
            gasPrice = parseInt(next.gasPrice) + parseInt(state.config.gasIncrement);
            gasPrice = gasPrice.toString();
        }
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

module.exports = {
    nextNonce,
    replayAndIncrementGasPrice,
    extractHashFromStacktrace,
    randomIndex,
    randomKey,
    logTx,
    backoff,
    addNonceToDroppedNoncesIfNotPresent
}