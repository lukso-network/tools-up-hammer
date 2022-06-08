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
    if(typeof(msg) === 'string') {
        console.log("[*] " + msg)
    } else {
        let numColumns = msg.length;
        let maxLength = 66;
        let spacePerColumn = maxLength / numColumns;
        let formatted = "";
        for(let i=0; i<msg.length; i++) {
            formatted += msg[i];
            let paddingLength = Math.floor(spacePerColumn - msg[i].length);
            if (paddingLength > 0) {
                formatted += new Array(paddingLength).join(" "); 
            }
            
        }
        console.log("[*] " + formatted)
    }
    
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