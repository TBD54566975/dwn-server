FROM node:18-buster

ARG DS_PORT
ENV DS_PORT=${DS_PORT:-3000}

WORKDIR /dwn-server

COPY package.json tsconfig.json entrypoint.sh ./
COPY src ./src

# DWN's levelDB has issues running on m1 when using an alpine base image, 
# so we have to install prerequisites and build node deps from source.
# RUN apk add --update python3 make g++

RUN npm install
RUN npm run build:esm

VOLUME /dwn-server/data

ENTRYPOINT [ "/dwn-server/entrypoint.sh" ]
EXPOSE ${DS_PORT}