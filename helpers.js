const fs = require("fs");

function getProfiles(profileDir) {
    let profiles = [];
    let files = fs.readdirSync(profileDir);
    for(f in files) {
        let data = fs.readFileSync(`${profileDir}${files[f]}`);
        let profile = JSON.parse(data);
        profiles.push(profile);
    }
    return profiles;

}

function getAddresses(profiles) {
    let addresses = profiles.flatMap((w) => [w.wallets.transfer.address, w.wallets.deploy.address])
    return addresses;
}

module.exports = {
    getProfiles,
    getAddresses
}