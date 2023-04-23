FROM node:18-buster

WORKDIR /dwn-server

COPY package.json entrypoint.sh ./
COPY src ./src

# DWN's levelDB has issues running on m1, so we have to install prerequisites and build node deps
# from source
# RUN apk add --update python3 make g++
RUN npm install
RUN npm run compile

ENTRYPOINT [ "/dwn-server/entrypoint.sh" ]
EXPOSE 3000