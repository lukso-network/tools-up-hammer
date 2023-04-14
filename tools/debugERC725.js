const { ERC725 } = require('@erc725/erc725.js');
const Web3 = require('web3');
const KeyManager = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');
const LSP6Schema = require('@erc725/erc725.js/schemas/LSP6KeyManager.json');
const schemas = require('../src/schemas.js').schemas;

const config = require("../src/config.json");
const RPC_URL = config.provider;
const web3 = new Web3(RPC_URL);

let address = "0x16D21A6A6DF6b4E59B29E23B52b1817d5bdcA68d";

// step 1 - setup erc725.js
const erc725 = new ERC725(
    LSP6Schema,
    address,
    web3.currentProvider,
  );
  
async function getPermissionedAddresses() {
    // step 2 - get the list of addresses that have permissions on the Universal Profile
    const result = await erc725.getData('AddressPermissions[]');

    for (let ii = 0; ii < result.value.length; ii++) {
        const address = result.value[ii];

        // step 3.1 - get the permissions of each address
        const addressPermission = await erc725.getData({
        keyName: 'AddressPermissions:Permissions:<address>',
        dynamicKeyParts: address,
        });

        // step 3.2 - decode the permission of each address
        const decodedPermission = erc725.decodePermissions(addressPermission.value);

        // we use JSON.stringify to display the permission in a readable format
        console.log(
        `decoded permission for ${address} = ` +
            JSON.stringify(decodedPermission, null, 2),
        );
    }
}

getPermissionedAddresses();