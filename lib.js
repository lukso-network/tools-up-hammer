const LSP7Mintable = require('@lukso/lsp-smart-contracts/artifacts/LSP7Mintable.json');
const schemas = require('./schemas.js').schemas;
const lsp3Profile = require('./profiles.js').profile;
const OPERATION_CALL = 0;

// Deploy LSP3 Account
async function deploy(lspFactory, controller_addresses, DEPLOY_PROXY) {
    if (typeof(controller_addresses) === 'string') {
        controller_addresses = [controller_addresses];
    }
    const up = await lspFactory.LSP3UniversalProfile.deploy(
        {
            controllerAddresses: controller_addresses, // Address which will controll the UP
            lsp3Profile: lsp3Profile,
        },
        {
            ERC725Account: {
                deployProxy: DEPLOY_PROXY,
            },
            UniversalReceiverDelegate: {
                deployProxy: DEPLOY_PROXY,
            },
            KeyManager: {
                deployProxy: DEPLOY_PROXY, 
            }
        }
    );
    return up;
}

async function deployLSP7(lspFactory, web3, owner_address, EOA) {
    const digitalAsset = await lspFactory.LSP7DigitalAsset.deploy({
        name: "Some LSP7",
        symbol: "TKN",
        controllerAddress: owner_address, // Account which will own the Token Contract
        isNFT: false,
    })
    
    const lsp7 = new web3.eth.Contract(
        LSP7Mintable.abi,
        digitalAsset.LSP7DigitalAsset.address,
        {
            from: EOA.address
        }
    );
    
    return lsp7;
}

//https://docs.lukso.tech/guides/assets/create-lsp7-digital-asset/
async function mint(lsp7, up_address, amount, up, EOA) {

    let targetPayload = await lsp7.methods.mint(up_address, amount, false, '0x').encodeABI();
    
    let abiPayload = up.erc725.methods.execute(OPERATION_CALL, lsp7._address, 0, targetPayload).encodeABI();

    await up.km.methods.execute(abiPayload).send({
        from: EOA.address, 
        gas: 5_000_000,
        gasPrice: '1000000000',
      });

    
    let totalSupply = await lsp7.methods.totalSupply().call()
    console.log(`[+] Minted ${totalSupply} tokens to ${lsp7._address}`);
}

module.exports = {
    mint,
    deploy,
    deployLSP7
}