const express = require('express');
const fs = require('fs');
const app = express();
const Web3 = require("web3");
var bodyParser = require('body-parser')

var jsonParser = bodyParser.json()

const config = require("../config.json");
const {getAddresses, getProfiles} = require("../helpers");

const web3 = new Web3(config.provider);

var profiles = {}
var counter = 0;

const profileDir = "./profiles/";
let localProfiles = getProfiles(profileDir);
var addresses = getAddresses(localProfiles);

console.log('Starting with authorized addresses...');
for(let i=0;i<addresses.length; i++) {
  console.log(addresses[i]);
}

app.post('/p/:profileId/a/:address/s/:signature', jsonParser, (req, res) => {
  if(addresses.includes(req.params.address)) {
    // if(web3.eth.accounts.recover(req.body, req.params.signature)) {
      profiles[req.params.profileId] = req.body;
      res.send(200);
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

app.get('/i/:addme/', (req, res) => {
  console.log(req.params.addme)
  counter += parseInt(req.params.addme);
  res.send(`Counter is ${counter}`);
})

app.get('/i/', (req, res) => {
  res.send(`Counter is ${counter}`);
})

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})