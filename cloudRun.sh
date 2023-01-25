#!/bin/bash
# docker build -t uphammer .
# gcloud auth configure-docker
# docker push HOSTNAME/PROJECT-ID/IMAGE:TAG
# docker push gcr.io/uphammer-368613/uphammer


# gcloud beta run jobs create JOB_NAME --image IMAGE_URL OPTIONS
# gcloud beta run jobs create uphammer --image gcr.io/uphammer-368613/uphammer



if [[ -z "${UPHAMMER_MONITOR}" ]]; then
	PROFILE=$((CLOUD_RUN_TASK_INDEX+1))
	echo $PROFILE

	while :
	do
		./cli.js profiles/profile$PROFILE.json presets/presets$PROFILE.json
		sleep 1
	done
	
else
	node tools/serverMonitor.js
fi