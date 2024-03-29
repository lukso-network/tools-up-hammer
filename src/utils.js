const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
const Web3 = require('web3');

const {
    log, 
    warn, 
    monitor, 
    DEBUG, 
    VERBOSE, 
    MONITOR, 
} = require('./logging');

/**
 * Returns the next nonce
 * @param {*} state 
 */
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
        let next = state.incrementGasPrice.shift();
        nonce = next.nonce;
        // TODO implement a better gasPrice incrementer
        // this one gets nonces "unstuck" much quicker than incrementing by 1. But it is also exponential which is problematic
        let multiplier = state.underPricedNonceMultiplier[nonce] ? state.underPricedNonceMultiplier[nonce] : 1
        gasPrice = parseInt(next.gasPrice) + (parseInt(state.config.gasIncrement) * multiplier);
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

/**
 * Stores sent nonces. This is useful to keep track of nonces that have been sent so we can account for them later
 * @param {*} state 
 * @param {*} nonce 
 */
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

/**
 * Stores a nonce in the droppedNonces array if it is not present.
 * Also sorts the array so that the lowest index is the lowest nonce
 * @param {*} state 
 * @param {*} nonce 
 */
function addNonceToDroppedNoncesIfNotPresent(state, nonce) {
    if(state.droppedNonces.indexOf(nonce) >= 0) {  return; }
    state.droppedNonces.push(nonce);
    state.droppedNonces.sort();
}

// this function might need to be removed because it creates useless traffic
// if we received a `replacement transaction underpriced` error, that means the mempool
// already has a TX using that nonce, and we don't actually have to create new TXs with that nonce
// so processing and replaying is a waste of resources
function replayAndIncrementGasPrice(state, nonce, gasPrice) {
    // have we seen this nonce before?
    if(!state.underPricedNonceMultiplier[nonce]) {
        state.underPricedNonceMultiplier[nonce] = 1;
    } else {
        state.underPricedNonceMultiplier[nonce] *= 2;
    }


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

/**
 * Catch all error handling function
 * Specific errors require handling nonces in different ways.
 * @param {*} state 
 * @param {*} error 
 * @param {*} nonce 
 * @param {*} receipt 
 * @param {*} gasPrice 
 */
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
    } else if(error.toString().includes("Transaction has been reverted")) {
        state.monitor.tx.receipts.reverts++;
    } else if(error.toString().includes("Transaction was not mined")) {
        state.monitor.tx.errors.txNotMined++;
    } else if(error.toString().includes("already known")) {
        state.monitor.tx.errors.alreadyKnown++;
        replayAndIncrementGasPrice(state, nonce, gasPrice);
    } else {
        warn(error, MONITOR); // setting this to monitor so we can see it in monitor mode
        state.monitor.tx.errors.misc++;
    }
    let hash = extractHashFromStacktrace(error);
    if (hash && state.config.logTx) {
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

/**
 * Resets monitoring data at the beginning of the cycle
 */
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

/**
 * Deprecated. We are no longer funding using the faucet
 * @param {} state 
 */
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

/**
 * If C2C data is received from the reporting server, apply it to state
 * @param {*} state 
 * @param {*} data 
 */
function processC2CData(state, data) {
    if(data) {
        state.c2c.pause = data.pause ? data.pause : false
    }
    
}

/**
 * Add additional data to monitor object before sending to reporting server
 * @param {*} data 
 * @param {*} state 
 */
function extraMonitorData(data, state) {
    data.maxDelay = state.config.maxDelay;
    data.c2c = state.c2c;
    return data;
}

/**
 * In cloud environments, console output is limited. This function will report on the state of the tool
 * to a reporting server
 * Since this was used with Google Cloud Run as a job, CLOUD_RUN_TASK_INDEX environment variables are used
 * to identity the UPhammer profile
 * @param {*} host 
 * @param {*} data 
 * @param {*} state 
 */
function reportToServer(host, data, state) {
    data = extraMonitorData(data, state) 
    let web3 = new Web3(state.config.provider);
    let msg = JSON.stringify(data);
    let profile = process.env.CLOUD_RUN_TASK_INDEX ? parseInt(process.env.CLOUD_RUN_TASK_INDEX)+1 : process.env.UPHAMMER_PROFILE 
    let signature = web3.eth.accounts.sign(msg, state.config.wallets.transfer.privateKey).messageHash;
    let url = `${host}/p/${profile}/a/${state.config.wallets.transfer.address}/s/${signature}`
    axios
        .post(url, data)
        .then(res => {
        //   console.log(`statusCode: ${res.status}`);
        //   console.log(res.data);
          let data = res.data;
          console.log(data);
          processC2CData(state, data);
        })
        .catch(error => {
          console.error(error);
        });
}

/**
 * Console monitoring output
 * @param {*} state 
 */
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
    let memoryUsage = process.memoryUsage();
    let rss = (memoryUsage.rss / 1024 / 1024 * 100).toFixed(1);
    let heapTotal = memoryUsage.heapTotal;;// / 1024 / 1024 * 100;
    let heapUsed = memoryUsage.heapUsed;// / 1024 / 1024 * 100;
    let usage = ((heapUsed/heapTotal) * 100).toFixed(1);
    let external = (memoryUsage.external / 1024 / 1024 * 100).toFixed(1);
    let netFails = state.monitor.networkFailures;
    let totalNetworkFailures = netFails.socketHangUp + netFails.econnreset + netFails.econnrefused + netFails.timedout + netFails.socketDisconnectedTLS + netFails.enotfound
    
    if(state.config.reportingServer) {
        let server = process.env.UPHAMMER_REPORTING_SERVER ? process.env.UPHAMMER_REPORTING_SERVER : state.config.reportingServer
        reportToServer(server, state.monitor, state);
    }

    if(state.config.runServer) {
        report = {
            usage,
            monitor: state.monitor
        }
        fs.writeFile(state.config.serverReportFile, JSON.stringify(report, null, 4), function(fd, er) {})
    }


    monitor(`************************************[*]************************************[*]`);
    monitor([`Memory Usage`,`${usage}% `])
    monitor([`Max Delay ${state.config.maxDelay}ms`, `Backoff ${state.backoff}ms`, `Tx Balance ${state.balance}`]);
    monitor([`Tx Total`, `${realTx}`, `Cycles`, `${state.monitor.tx.loop}`, `Ratio`, `${txLoopRatio}%`]); 
    monitor([`Transfer`, `${state.monitor.tx.sent}`, `Attempted`, `${state.monitor.tx.attemptedTx}`]);
    monitor([`    Mint`, `${state.monitor.tx.mint}`,  `Attempted`, `${state.monitor.tx.attemptedMint}` ]);
    monitor([`Receipts`, `${totalReceipts}`, `Pending`, `${Object.keys(state.pendingTxs).length}`, `Tx Hashes`, `${state.monitor.tx.hash}`]);
    monitor([`    Transfers`, `${state.monitor.tx.receipts.transfers}`, `Mints`, `${state.monitor.tx.receipts.mints}`, `Reverts ${state.monitor.tx.receipts.reverts}`])
    monitor(`Errors ${totalErrors}`);
    monitor([`    Underpriced`, `${state.monitor.tx.errors.underpriced}`,             `TX Receipt`, `${state.monitor.tx.errors.transactionReceipt}`]);
    monitor([`    Invalid JSON`, `${state.monitor.tx.errors.invalidJSON}`,   `Nonce too low`, `${state.monitor.tx.errors.nonceTooLow}`]);
    monitor([`    Tx Not Mined`, `${state.monitor.tx.errors.txNotMined}`,             `Misc`, `${state.monitor.tx.errors.misc}`]);
    
    monitor(`Network Failures ${totalNetworkFailures}`);
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

/**
 * Save presets to disk
 * @param {*} state 
 * @param {*} presetsFile 
 */
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

    let serialized = JSON.stringify(presets, null, 4);
    fs.writeFile(presetsFile, serialized, err => {
        if (err) {
          console.error(err);
        }
    })

}

function readFiles(dirname, onFileContent, onFinish) {
    fs.readdir(dirname, function(err, filenames) {
      if (err) {
        onError(err);
        return;
      }
      filenames.forEach(function(filename) {
        
        try {
          let content = fs.readFileSync(dirname + filename, 'utf-8')  
          let profile = JSON.parse(content);
          onFileContent(profile);
        } catch(e) {
          console.log(`[!] Error opening ${diname + filename}`)
        }
      });
      onFinish();
    });
  }

/**
 * Returns an instance of web3
 * For use to alternate between http and websockets versions of web3
 * Currently untested with websockets. 
 * Will only return the web3 in `state` if not `wsProvider` is specified in config
 * @param {*} state 
 */
function whichWeb3(state) {
    if (!state.config.wsProvider) {
        return state.web3;
    }
    
    if(crypto.randomInt(100) > 50) {
        return state.web3;
    } else {
        return state.ws;
    }
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
    fund,
    readFiles,
    whichWeb3
}