#!/bin/bash
while :
do
	./cli.js profiles/profile$UPHAMMER_PROFILE.json presets/presets$UPHAMMER_PROFILE.json
	sleep 1
done