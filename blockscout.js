const https = require('https');
const axios = require('axios');
const events = require('events');
const fs = require('fs');
const readline = require('readline');
const delay = require('await-delay');
const lineReader = require('line-reader');

let hostname = "blockscout.com"

let hashes = [];
let nextHash = 0;
let continuing = true;
let linesRead = 0;

function reportReason(hash) {
    let path = `https://${hostname}/lukso/l14/tx/${hash}/internal-transactions`;
    console.log(hash);

    axios
    .get(path)
    .then(res => {
      console.log(`statusCode: ${res.status}`);
      if(res.status == 200) {
        let startRaw = res.data.indexOf("Raw:");
        if(startRaw > 0) {
          console.log("Start: " + startRaw);
          let firstSlice = res.data.slice(startRaw);
        //   console.log(firstSlice);
          let endRaw = firstSlice.indexOf("</code>");
          console.log(endRaw);
          let reason = firstSlice.slice(0, endRaw);
          console.log(reason);
    
        }
    }
    })
    .catch(error => {
      console.error(error);
    });

    
    // const options = {
    //     hostname,
    //     port: 443,
    //     path,
    //     method: 'GET',
    //   };
      
    //   const req = https.request(options, res => {
    //     console.log(`statusCode: ${res.statusCode}`);
        
    //     res.on('data', d => {

            
    //     });
    //   });
      
    //   req.on('error', error => {
    //     console.error(error);
    //   });
      
    //   req.end();
}

async function processLineByLine() {
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream('txErrors'),
        crlfDelay: Infinity
      });
  
      rl.on('line', async (hash) => {
        hashes.push(hash);
      });
  
      await events.once(rl, 'close');
  
      console.log('Reading file line by line with readline done.');
      const used = process.memoryUsage().heapUsed / 1024 / 1024;
      console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
    } catch (err) {
      console.error(err);
    }
  }

async function continuousReadline() {
    let localLinesRead = 0;
    lineReader.eachLine('txErrors', async function(hash, last) {
        if (localLinesRead > linesRead) {
            console.log(`${hash}`);
            hashes.push(hash);
            linesRead++;
        }
        localLinesRead++;
        
        if(last) {
          console.log('Reached current end. Waiting for more');
          await delay(5000);
          continuousReadline();
          
        }
      });
}

async function processHashes() {
    while(continuing) {
        if(nextHash < hashes.length) {
            let hash = hashes[nextHash++];
            reportReason(hash);
            await delay(1000);
        }
    }
}

async function run() {
    // await processLineByLine();
    await continuousReadline();
    processHashes();
}

run();
