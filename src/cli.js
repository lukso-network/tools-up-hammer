#!/usr/bin/env node
const fs = require("fs");
const UPHammer = require("./uphammer");
const utils = require("./utils");

let [,, ...args] = process.argv;
let userFiles = ['config', 'presets'];
let config, presets;
let profileNumber;

if(args) {
    if(args.length === 1) {
        if(args[0].startsWith("preset")) {
            // its a preset file
            presets = JSON.parse(fs.readFileSync(args[0]));
        } else {
            config = JSON.parse(fs.readFileSync(args[0]));
        }
    } else if(args.length > 1) {
        // are we building out presets?
        if(args[0] === "build") {
            profileNumber = parseInt(args[1])
            config = {
                buildPresets: true,
                deployOnly: true,
                logLevel: 2
            }
        
        // is it a config or preset file?
        } else {
            for(let i=0; i<args.length; i++) {
                try {
                    parsed = JSON.parse(fs.readFileSync(args[i]));
                    if(i==0) {
                        config = parsed;
                    } else {
                        presets = parsed;
                    }
                } catch(e) {
                    console.log(`[!] Failed to open ${userFiles[i]} file ${args[i]}`);
                    console.log(e);
                    process.exit();
                }
            }
        }
        
    }
}

if(config.buildPresets) {
    let content = fs.readFileSync(`profiles/profile${profileNumber}.json`, 'utf-8')  
    let profile = JSON.parse(content);
    
    config = {
        ...profile,
        ...config
    }
}

const uphammer = new UPHammer(config, presets);
uphammer.start();    


