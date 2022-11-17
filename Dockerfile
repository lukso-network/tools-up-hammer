# syntax=docker/dockerfile:1
FROM node:16.15.0-alpine
RUN apk update && apk add --no-cache bash
WORKDIR /app
COPY . .
RUN npm install
# remove this line and set by other means
#ENV UPHAMMER_PROFILE=1
#ENTRYPOINT /bin/bash uphammerProfileEnv.sh 1> /tmp/uphammerOutput.txt 2>/tmp/errorOutput.txt 
ENTRYPOINT /bin/bash cloudRun.sh
