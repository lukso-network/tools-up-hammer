const express = require('express');
const fs = require('fs');
var cors = require('cors');

const Web3 = require("web3");
var bodyParser = require('body-parser')

var jsonParser = bodyParser.json()

const config = require("../config.json");
const {getAddresses, getProfiles} = require("../helpers");


const app = express();

const web3 = new Web3(config.provider);

var profiles = {}
var commands = {}


const profileDir = "./profiles/";
let localProfiles = getProfiles(profileDir);
var addresses = getAddresses(localProfiles);

console.log('Starting with authorized addresses...');
for(let i=0;i<addresses.length; i++) {
  console.log(addresses[i]);
}

app.use(cors());

app.post('/p/:profileId/a/:address/s/:signature', jsonParser, (req, res) => {
  if(addresses.includes(req.params.address)) {
    // if(web3.eth.accounts.recover(req.body, req.params.signature)) {
      let timestamp = Date.now();
      profiles[req.params.profileId] = {...req.body, timestamp };
      res.send(commands[req.params.profileId]);
    // } else {
    //   console.log('Signature incorrect');
    //   res.send(401);
    // }
    
  } else {
    res.send(401);
  }
  
})

app.get('/p/:profileId/', (req, res) => {
  console.log(profiles);
  res.send(profiles[req.params.profileId]);
})

// this needs some sort of authentication
app.post('/c/:profileId/', jsonParser, (req, res) => {
  console.log(req.body);
  commands[req.params.profileId] = req.body;
})

const port = parseInt(process.env.PORT) || 8080;

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})
