# syntax=docker/dockerfile:1
FROM node:16.15.0-alpine
RUN apk update && apk add --no-cache bash
WORKDIR /app
COPY . .
RUN npm install
ENTRYPOINT /bin/bash ./scripts/cloudRun.sh
