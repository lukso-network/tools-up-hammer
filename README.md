# LUKSO UP Hammer

A network stress testing tool


## Install
git clone git@github.com:lukso-network/tools-up-hammer.git
cd tools-up-hammer
npm i

## Running

### .env file

The address and private key for the EOA that runs uphammer must be stored in an .env file located in the same directory that the script is run in. At minimum this file must have an ADDRESS and PRIVATE_KEY environment variable set.

Additional options for setting the erc725 and key manager addresses for the first one or two UPs, as well as an initial LSP7 address can also be added to expedite the setup.

A template .env file is as follows

ADDRESS=
PRIVATE_KEY=
ERC725_ADDRESS=
KEYMANAGER_ADDRESS=
ERC725_ADDRESS_B=
KEYMANAGER_ADDRESS_B=
LSP7_ADDRESS=

### Usage
Uphammer defaults to using the L16 network. To use L14, pass -l14 as a command line argument

Use --noproxies to disable deploying proxy contracts (needs more testing)


## Scaling

Currently, calls are made syncrhonously using await statements. This makes the script wait for the request to finish before the script can continue, and therefore does not actually model the burst architecture of actual internet communication. One option would be to remove the await statements and instead take advantage of promises. Since javascript is single threaded, it should be safe to update the state of the script in this fashion. However, this might take time to fully implement. A faster way to scale the script would be to wrap it in a bash script that would spin up 10, 20, 100 or more uphammer scripts running as daemons. This could easily parralellize the script without much additional work.


## TODO

Improve usage of script with better error handling of .env file and cli args.
