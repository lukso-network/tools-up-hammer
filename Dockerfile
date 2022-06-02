# syntax=docker/dockerfile:1
FROM node:16.15.0-alpine
RUN apk update && apk add --no-cache bash
WORKDIR /app
COPY . .
RUN npm install
# remove this line and set with kubernetes
# ENV UPHAMMER_PROFILE=1
CMD /bin/bash uphammerProfileEnv.sh 1> /tmp/uphammerOutput.txt 2>/tmp/errorOutput.txt
