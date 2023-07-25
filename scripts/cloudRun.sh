#!/bin/bash

if [[ -z "${UPHAMMER_MONITOR}" ]]; then
	PROFILE=$((CLOUD_RUN_TASK_INDEX+1))
	echo $PROFILE

	while :
	do
		./src/cli.js profiles/profile$PROFILE.json presets/presets$PROFILE.json
		sleep 1
	done
	
else
	node tools/serverMonitor.js
fi