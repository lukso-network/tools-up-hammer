const {resetMonitor} = require('./utils');

let state = {
    up: {},
    lsp7: {
        transferable: false,
        addresses: {}
    },
    lsp8: {
        transferable: false,
        addresses: {}
    },
    nonce: null,
    droppedNonces: [],
    incrementGasPrice: [],
    pendingTxs: [],
    sentNonces: [],
    web3: null,
    lspFactory: null,
    DEPLOY_PROXY: null,
    EOA: {},
    config: null,
    deploying: false,
    backoff: 0,
    monitor: resetMonitor()
}

module.exports = {
    state
}