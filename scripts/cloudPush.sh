#!/bin/bash

# build 
docker build -t uphammer .
# tag
docker tag uphammer gcr.io/uphammer-368613/uphammer
# the following command requires auth so run the following command before running the first time
# gcloud auth configure-docker 
# the syntax for this command is
# docker push HOSTNAME/PROJECT-ID/IMAGE:TAG
docker push gcr.io/uphammer-368613/uphammer