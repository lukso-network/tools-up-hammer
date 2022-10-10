const Web3 = require("web3");
const config = require("../config.json");

// const l16 = "http://34.141.186.165:8545";
const l16 = config.provider;
console.log(l16);

async function test()    {
    for(let i=0; i< 50; i++) {
        
        let resp = await web3.eth.getBalance("0x32072f29eb14Cb8E8B0daeBb9370D3C7B139a17f");
        console.log(resp);
    }
}

let ips = [
    "34.141.186.165",
    "34.90.174.53",
    "34.91.85.185",
    "34.91.191.203",
    "34.90.88.245",
    "34.90.88.247",
    "34.147.106.74",
    "35.204.176.52",
    "34.90.106.206",
    "34.91.183.140"
]
let profiles = [
    "0x332F3463b34570087a11546D34Fd11a4881da772",
    "0x6B9437DE67937Bf8A12b329E7d3f22b2173Fb584",
    "0x3EaF9536F2E77E285FAFc84113C3E18c77F360b8",
    "0x2b2204504ebAFf7B8da9A916808C0583876d5222",
    "0xAf4beb69589f02aA29D64adff3fa63410F9AfBe4",
    "0x9e2DCc5E8A8e90F2c6b338A15Cff3AfCfEAa8aDd",
    "0xb8eb8781DcC89512A4B032103B7E3a475e389d01",
    "0x39fA87346E1835d899cC23A768225C96Fe40a111",
    "0xa32287F3DC3FB80d99d37115C1149FE53Aa40583",
    "0x990a91A96542eD26F32B8FC5191A899FEA7c6b20",
    "0xABD8529925b829C52DFA0D778457Fd52EfF87ED6",
    "0x84A130Bb9404B973984A9b76050AEfD404F8e6Bf",
    "0x1471C7377C09484752D5A8e0085632A9396B6923",
    "0x909D5C7dab2B202ba279dC65a7432D1243d47430",
    "0x173d83314C69d1d16308b525fFB4dE163b29569E",
    "0xC06Bd20F78d119575B7b6A293B4275dBc99d4b01",
    "0xa48b89C6A7Ad75F9c34eF89Ba227253710612C35",
    "0x0f7346CC72C8EBfB65f10Ae92604e268D9c1FfF7",
    "0xe4d2892A5b39A3CbD09907cE8412C4Bd27461240",
    "0xe0b550025159cf68EE553DCFd8f1d9dd720d591C"
];

async function testBootnodes() {
    for(i in ips) {
        let endpoint = `http://${ips[i]}:8545/`;
        console.log(endpoint);
        let web3 = new Web3(endpoint);
        for(p in profiles) {
            try {
            
                let resp = await web3.eth.getBalance(profiles[p]);
                console.log(resp);
            } catch(e) {
                console.log(e);
            }
        }
        
        
    }
    
}

async function testProfileBalances() {
   

    let web3 = new Web3(l16);
    for(let p=0; p<profiles.length; p++) {
        try {
            
            let resp = await web3.eth.getBalance(profiles[p]);
            console.log(`Balance ${profiles[p]}: ${resp}`);
        } catch(e) {
            console.log(e);
        }
    }


}
async function main() {
    // await testBootnodes();
    testProfileBalances();
}

main();
