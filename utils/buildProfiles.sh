#!/bin/bash

for i in `seq $1`
do
    echo $i
    # ./cli.js build $i >> /tmp/uphammer$i.log 2>&1 &
done