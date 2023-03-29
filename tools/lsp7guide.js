const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const Web3 = require('web3');
const  ethers  = require('ethers');

const RPC_URL = 'http://127.0.0.1:8545'; //'https://rpc.2022.l16.lukso.network/'

const web3 = new Web3(RPC_URL);

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// initialize your EOA
const privateKey = '0xbce432d801f2c9d5dc931bcfe2207f99a957ac79e2377335b08c763ce8191f66';
const account = web3.eth.accounts.wallet.add(privateKey);

const myEOA = new ethers.Wallet(privateKey).connect(provider);

// create a contract instance
const myToken = new web3.eth.Contract(LSP7Mintable.abi, {
  gas: 5_000_000,
  gasPrice: '1000000000',
});

async function deploy() {
    // deploy the token contract
    let lsp7 = await myToken.deploy({
        data: LSP7Mintable.bytecode,
        arguments: [
        'My LSP7 Token', // token name
        'LSP7', // token symbol
        account.address, // new owner, who will mint later
        false, // isNonDivisible = TRUE, means NOT divisible, decimals = 0)
        ],
    })
    .send({ from: account.address });

    return lsp7;
}

async function mint(lsp7_address) {

    const myToken = new web3.eth.Contract(LSP7Mintable.abi, lsp7_address , {
        gas: 5_000_000,
        gasPrice: '1000000000',
      });

    await myToken.methods.mint("0xE16f3C193Ff42b1EbDf8EC49056EA89190f108A1", 100, false, '0x')
    .send({ 
        from: account.address
    });
}

async function mintethers(myTokenAddress) {
    const myToken = new ethers.Contract(myTokenAddress, LSP7Mintable.abi);

    await myToken.connect(myEOA).mint(account.address, 100, false, '0x');
}

async function main() {
    let lsp7 = await deploy();
    console.log(`lSP7 ${lsp7._address}`)
    await mintethers(lsp7._address);
}

main()
