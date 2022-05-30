const config = require("./config.json");

const DEBUG = 0;
const VERBOSE = 1;
const INFO = 2;
const MONITOR = 3;
const QUIET = 4;

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

function monitor(msg) {
    console.log("[*] " + msg)
}

module.exports = {
    log,
    warn,
    monitor,
    DEBUG,
    VERBOSE,
    INFO,
    MONITOR,
    QUIET
}