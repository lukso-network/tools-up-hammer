#!/bin/bash
while :
PROFILE=$((CLOUD_RUN_TASK_INDEX+1))
echo $PROFILE
do
	./cli.js profiles/profile$PROFILE.json presets/presets$PROFILE.json
	sleep 1
done