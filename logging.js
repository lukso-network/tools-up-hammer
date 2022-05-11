const config = require("./config.json");

const DEBUG = 0;
const VERBOSE = 1;
const INFO = 2;
const QUIET = 3;

function log(msg, level) {
    if (level >= config.logLevel) {
        console.log("[+] " + msg);
    }
}

function warn(msg, level) {
    if (level >= config.logLevel) {
        console.log("[!] " + msg);
    }
}

module.exports = {
    log,
    warn,
    DEBUG,
    VERBOSE,
    INFO,
    QUIET
}