#!/usr/bin/env node
const fs = require("fs");
const UPHammer = require("./uphammer");

let [,, ...args] = process.argv;
let userFiles = ['config', 'presets'];
let config, presets;

if(args) {
    for(let i=0; i<args.length;i++) {
        try {
            parsed = JSON.parse(fs.readFileSync(args[i]));
            if(i==0) {
                config = parsed;
            } else {
                presets = parsed;
            }
        } catch(e) {
            console.log(`[!] Failed to open ${userFiles[i]} file ${args[0]}`);
            console.log(e);
            process.exit();
        }
    }

}

const uphammer = new UPHammer(config, presets);
uphammer.start();
