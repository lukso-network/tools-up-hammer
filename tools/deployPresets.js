const fs = require("fs");
const UPHammer = require("../uphammer");


function deployPresets(profileNumber) {
    config = {
        buildPresets: true,
        deployOnly: true,
        logLevel: 2
    }
    
    let content = fs.readFileSync(`profiles/profile${profileNumber}.json`, 'utf-8');
    let profile = JSON.parse(content);
    
    config = {
        ...profile,
        ...config
    }
    
    
    const uphammer = new UPHammer(config, profileNumber);
    uphammer.start();    
}

function deployAll(numProfiles) {
    for(let i=1; i <=numProfiles; i++) {
        deployPresets(i);
    }
}

deployAll(9);