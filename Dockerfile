# NOTE: `bookworm` is 2024-06-29 v12.6 release of Debian OS
#       `slim` is a leaner image, optimized for production.
FROM node:20-bookworm-slim

ARG DS_PORT
ENV DS_PORT=${DS_PORT:-3000}

WORKDIR /dwn-server

COPY package.json package-lock.json tsconfig.json entrypoint.sh ./
COPY src ./src

# DWN's levelDB has issues running on m1 when using an alpine base image, 
# so we have to install prerequisites and build node deps from source.
# RUN apk add --update python3 make g++

RUN npm install
RUN npm run build:esm

VOLUME /dwn-server/data

ENTRYPOINT [ "/dwn-server/entrypoint.sh" ]
EXPOSE ${DS_PORT}
