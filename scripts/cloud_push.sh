#!/bin/bash

docker build -t uphammer .
docker tag uphammer gcr.io/uphammer-368613/uphammer
docker push gcr.io/uphammer-368613/uphammer