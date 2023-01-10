const fs = require("fs");
const UPHammer = require("../uphammer");

var instances = [];

function configurePresets(profileNumber) {
    config = {
        buildPresets: true,
        deployOnly: true,
        logLevel: 2,
        savePresets: true
    }
    
    let content = fs.readFileSync(`profiles/profile${profileNumber}.json`, 'utf-8');
    let profile = JSON.parse(content);
    
    config = {
        ...profile,
        ...config
    }
    const uphammer = new UPHammer(config, profileNumber);
    instances.push(uphammer);

}

function deployPresets() {
    
    for(i in instances) {
        let uphammer = instances[i];
        uphammer.start();    
    }
}

function testSeparationOfState(instances) {
    let lsp1 = instances[0].state.lspFactory;
    for(i in instances) {
        if(lsp1 === instances[i].state.lspFactory) {
            console.log(`[!] Instance 0 and ${i} share the same state`);
        }
    }
}

function main(numProfiles) {
    for(let i=1; i <=numProfiles; i++) {
        configurePresets(i);
    }
    // testSeparationOfState(instances);
    deployPresets();
}

main(30);