#!/bin/bash
while :
do
	./src/cli.js profiles/profile$1.json presets/presets$1.json
	sleep 1
done