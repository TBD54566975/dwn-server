# using buster to m
FROM node:18-alpine3.17

WORKDIR /dwn-aggregator

COPY package.json ./
COPY src ./src
COPY resources ./resources

# DWN's levelDB has issues running on m1, so we have to install prerequisites and build node deps
# from source
RUN apk add --update python3 make g++
RUN npm install --build-from-source

ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini

ENTRYPOINT [ "/tini", "--", "/dwn-aggregator/entrypoint.sh" ]
EXPOSE 3000