const config = require("./config.json");

const DEBUG = 0;
const VERBOSE = 1;
const INFO = 2;
const MONITOR = 3;
const QUIET = 4;

function formatProfile(state) {
    let profile = '';
    if(state && state.profile) {
        profile = ` (${state.profile})`;
    }
    return profile;
}


function log(msg, level, state) {
    profile = formatProfile(state);
    if (level >= config.logLevel) {
        console.log(`[+]${profile} ${msg}`);
    }
}

function warn(msg, level, state) {
    profile = formatProfile(state);
    if (level >= config.logLevel) {
        console.log(`[!]${profile} ${msg}`);
    }
}

function monitor(msg) {
    if(typeof(msg) === 'string') {
        console.log("[*] " + msg)
    } else {
        let numColumns = msg.length;
        let maxLength = 80;
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