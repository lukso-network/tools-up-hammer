const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

const config = require("../config.json");

app.get('/', (req, res) => {
  let reportRaw = fs.readFileSync(`../${config.serverReportFile}`);
  let report = JSON.parse(reportRaw);
  res.send(report);
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})