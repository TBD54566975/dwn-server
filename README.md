# DWN Server <!-- omit in toc -->

Exposes a multi-tenanted DWN (aka Decentralized Web Node) through a JSON-RPC API over `http:` and `ws:`

- [Supported DBs](#supported-dbs)
- [Installation](#installation)
- [Package usage](#package-usage)
- [Running The Server](#running-the-server)
- [JSON-RPC API](#json-rpc-api)
  - [Available Methods](#available-methods)
    - [`dwn.processMessage`](#dwnprocessmessage)
      - [Params](#params)
      - [Example Request Message](#example-request-message)
      - [Example Success Response](#example-success-response)
      - [Example Error Response](#example-error-response)
      - [Transporting large amounts of data](#transporting-large-amounts-of-data)
      - [Receiving large amounts of data](#receiving-large-amounts-of-data)
- [npm scripts](#npm-scripts)
- [Configuration](#configuration)
  - [Storage Options](#storage-options)

## Supported DBs

- LevelDB :heavy_check_mark:
- SQLite :heavy_check_mark:
- MySQL :heavy_check_mark:
- PostgreSQL :heavy_check_mark:

See more in [Storage Options](#storage-options)

## Running online environment

Interested in contributing instantly? You can make your updates directly without cloning in the running CodeSandbox environment.

[![Button to click and edit the code in CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/github/TBD54566975/dwn-server/main)

## Installation

```bash
npm install @web5/dwn-server
```

## Package usage

```typescript
import { DwnServer } from '@web5/dwn-server';

const server = new DwnServer();

server.start();
```

## Running the server

### Running via docker

`docker run -p 3000:3000 -v myvolume:/dwn-server/data ghcr.io/tbd54566975/dwn-server:main`

This can run on services like AWS, GCP, VPS, home server (with ngrok or cloudflare), fly.io, render.com etc.
Ideally the volume is persistent so that data is kept (or has to be synced back from another DWN instance).

### Running a specific version

Running the command above will run the latest version at the time the image is pulled. If you need to run a specific version (and in many cases this is recommended) [you can see the list published images here](https://github.com/TBD54566975/dwn-server/pkgs/container/dwn-server/versions)

To run a specific image:
`docker pull ghcr.io/tbd54566975/dwn-server@sha256:870e0f0f12016e6607060a81ea31458443f7439522fab2688d7a6706ab366c58`

### Running Locally for Development

```bash
git clone https://github.com/TBD54566975/dwn-server.git
cd dwn-server
npm install
npm run server
```

### Building a docker image locally

A docker image is continuously published from this repository, but if you want to build it locally run:
`docker build -t dwn-server .`

## JSON-RPC API

[JSON-RPC](https://www.jsonrpc.org/specification) is a lightweight remote procedure call (RPC) protocol that uses JSON as a data format for exchanging information between a client and a server over a network. JSON-RPC is language-independent and transport-agnostic which makes it usable in a variety of contexts (e.g. browser, server-side)

With JSON-RPC, a client sends a request message to a server over a network, and the server responds with a response message.

The request message consists of:

- a method name (`method`)
- a set of parameters (`params`)
- an identifier (`id`).

The response message contains:

- the same identifier that was sent with the request message (`id`)
- the result of the method invocation (`result`)
- an error message if the method invocation failed (`error`)

### Available Methods

#### `dwn.processMessage`

Used to send DWeb Messages to the server.

##### Params

| Property      | Required (Y/N) | Description                                                               |
| ------------- | -------------- | ------------------------------------------------------------------------- |
| `target`      | Y              | The DID that the message is intended for                                  |
| `message`     | Y              | The DWeb Message                                                          |
| `encodedData` | N              | Data associated to the message (e.g. data associated to a `RecordsWrite`) |

##### Example Request Message

```json
{
  "jsonrpc": "2.0",
  "id": "b23f9e31-4966-4972-8048-af3eed43cb41",
  "method": "dwn.processMessage",
  "params": {
    "message": {
      "recordId": "bafyreidtix6ghjmsbg7eitexsmwzvjxc7aelagsqasybmql7zrms34ju6i",
      "descriptor": {
        "interface": "Records",
        "method": "Write",
        "dataCid": "bafkreidnfo6aux5qbg3wwzy5hvwexnoyhk3q3v47znka2afa6mf2rffkbi",
        "dataSize": 32,
        "dateCreated": "2023-04-30T22:49:37.713976Z",
        "dateModified": "2023-04-30T22:49:37.713976Z",
        "dataFormat": "application/json"
      },
      "authorization": {
        "payload": "eyJyZWNvcmRJZCI6ImJhZnlyZWlkdGl4Nmdoam1zYmc3ZWl0ZXhzbXd6dmp4YzdhZWxhZ3NxYXN5Ym1xbDd6cm1zMzRqdTZpIiwiZGVzY3JpcHRvckNpZCI6ImJhZnlyZWlheTVwNWZ1bzJhc2hqZXRvbzR1M3p1b282dW02cGlzNHl5NnUzaHE1emxsdmZhN2ZubXY0In0",
        "signatures": [
          {
            "protected": "eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa3UxaDRMZGtoWFczSG5uQktBTnhnVWFRMTYyY3ZXbVJ1emNiZDJZZThWc3RaI2RpZDprZXk6ejZNa3UxaDRMZGtoWFczSG5uQktBTnhnVWFRMTYyY3ZXbVJ1emNiZDJZZThWc3RaI3o2TWt1MWg0TGRraFhXM0hubkJLQU54Z1VhUTE2MmN2V21SdXpjYmQyWWU4VnN0WiJ9",
            "signature": "cy_RtWjjVK2mmKkI_35qiv54_1Pp_f7SjAx0z75PBL4th-fgfjuLZmF-V3czCWwFYMMnN0W4zl3LJ2jEf_t9DQ"
          }
        ]
      }
    },
    "target": "did:key:z6Mku1h4LdkhXW3HnnBKANxgUaQ162cvWmRuzcbd2Ye8VstZ",
    "encodedData": "ub3-FwUsSs4GgZWqt5eXSH41RKlwCx41y3dgio9Di74"
  }
}
```

##### Example Success Response

```json
{
  "jsonrpc": "2.0",
  "id": "18eb421f-4750-4e31-a062-412b71139546",
  "result": {
    "reply": {
      "status": {
        "code": 202,
        "detail": "Accepted"
      }
    }
  }
}
```

##### Example Error Response

```json
{
  "jsonrpc": "2.0",
  "id": "1c7f6ed8-eaaf-447c-aaf3-b9e61f3f59af",
  "error": {
    "code": -50400,
    "message": "Unexpected token ';', \";;;;@!#@!$$#!@%\" is not valid JSON"
  }
}
```

##### Transporting large amounts of data

`RecordsWrite` data can be of any size. If needed, large amounts of data can be streamed to the server over http by:

- including the JSON-RPC request message in a `dwn-request` request header
- setting the `content-type` request header to `application/octet-stream`
- sending binary data in the request body.

> :bulb: Examples can be found in the [`examples`](./examples) directory.

##### Receiving large amounts of data

`RecordsWrite` data can be of any size. `RecordsWrite` messages returned as the result of a `RecordsQuery` will include `encodedData` _if_ the `RecordsWrite` data is under `9.77KB`. Data larger than this will need to be fetched using `RecordsRead` which can be done over http. The response to a `RecordsRead` includes:

- The JSON-RPC response message in a `dwn-response` header
- The associated data as binary in the response body.

Examples can be found in the `examples` directory.

> :bulb: **TODO**: Add examples in `examples` directory

## Hosting your own DWN-server

By default, when you call `web5.connect()` there will be some bootstrap DWN nodes included which allow people to reach you via your DID.

You may want to run a DWN server just for you, or as a public service for you and your friends and family.
DWNs can be as simple as a docker image or a node process running somewhere.

DWN-servers can run anywhere you can run node.js or docker. http and websocket need to be available to the DWN server.
See below for some suggestions.

### Running on render.com

You can run an instance on the render.com service:

- Create a render.com account
- Fork this repo
- Upgrade your render.com account to a paid account
- Create a new "Web service" type application
- Choose the forked repo to run (or you can point to the main repo)
- Choose the "starter" size instance
- Create a 1GB (or larger) disk, and mount it on /dwn-server/data

### Running with ngrok

You can run a DWN-server on your local machine or home server and expose it to the internet using ngrok.

First, install [ngrok](https://ngrok.com/download)

Then run:

```bash
docker run -p 3000:3000 -v myvolume:/dwn-server/data ghcr.io/tbd54566975/dwn-server:main

## in another terminal:
ngrok http 3000
```

Note the resulting publicly addressable https url for your DWN instance.

### Running with cloudflared

Cloudflare has a tunnel service that you can use to expose your DWN server to the internet, if you run it on a server at home.
With [cloudflared](https://github.com/cloudflare/cloudflared) installed, run the following commands:

```bash
git clone https://github.com/TBD54566975/dwn-server.git
cd dwn-server
npm install
npm run server

## in another terminal:

cloudflared tunnel --url http://localhost:3000
```

### Running on GCP

... check back soon ...
(enterprising people I am sure can work it out)

## `npm` scripts

| Script                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run build:esm`    | compiles typescript into ESM JS                                    |
| `npm run build:cjs`    | compiles typescript into CommonJS                                  |
| `npm run build`        | compiles typescript into ESM JS & CommonJS                         |
| `npm run clean`        | deletes compiled JS                                                |
| `npm run lint`         | runs linter                                                        |
| `npm run lint:fix`     | runs linter and fixes auto-fixable problems                        |
| `npm run test`         | runs tests                                                         |
| `npm run server`       | starts server                                                      |
| `npm run prepare`      | prepares husky for pre-commit hooks (auto-runs with `npm install`) |

## Configuration

Configuration can be set using environment variables

| Env Var                                           | Description                                                                                                             | Default                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `DS_PORT`                                         | Port that the server listens on                                                                                         | `3000`                 |
| `DS_MAX_RECORD_DATA_SIZE`                         | Maximum size for `RecordsWrite` data. use `b`, `kb`, `mb`, `gb` for value                                               | `1gb`                  |
| `DS_WEBSOCKET_SERVER`                             | Whether to enable listening over `ws:`. values: `on`,`off`                                                              | `on`                   |
| `DWN_REGISTRATION_STORE_URL`                      | URL to use for storage of registered DIDs. Leave unset to if DWN does not require registration (ie. open for all)       | unset                  |
| `DWN_REGISTRATION_PROOF_OF_WORK_SEED`             | Seed to generate the challenge nonce from, this allows all DWN instances in a cluster to generate the same challenge.   | unset                  |
| `DWN_REGISTRATION_PROOF_OF_WORK_ENABLED`          | Require new users to complete a proof-of-work challenge                                                                 | `false`                |
| `DWN_REGISTRATION_PROOF_OF_WORK_INITIAL_MAX_HASH` | Initial maximum allowed hash in 64 char HEX string. The more leading zeros (smaller number) the higher the difficulty.  | `false`                |
| `DWN_TERMS_OF_SERVICE_FILE_PATH`                  | Required terms of service agreement if set. Value is path to the terms of service file.                                 | unset                  |
| `DWN_STORAGE`                                     | URL to use for storage by default. See [Storage Options](#storage-options) for details                                  | `level://data`         |
| `DWN_STORAGE_MESSAGES`                            | URL to use for storage of messages.                                                                                     | value of `DWN_STORAGE` |
| `DWN_STORAGE_DATA`                                | URL to use for data storage                                                                                             | value of `DWN_STORAGE` |
| `DWN_STORAGE_EVENTS`                              | URL to use for event storage                                                                                            | value of `DWN_STORAGE` |

### Storage Options

Several storage formats are supported, and may be configured with the `DWN_STORAGE_*` environment variables:

| Database   | Example                                               | Notes                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LevelDB    | `level://data`                                        | use three slashes for absolute paths, two for relative. Example shown uses directory `data` in the current working directory                                                          |
| Sqlite     | `sqlite://dwn.db`                                     | use three slashes for absolute paths, two for relative. Example shown creates a file `dwn.db` in the current working directory                                                        |
| MySQL      | `mysql://user:pass@host/db?debug=true&timezone=-0700` | [all URL options documented here](https://github.com/mysqljs/mysql#connection-options)                                                                                                |
| PostgreSQL | `postgres:///dwn`                                     | any options other than the URL scheme (`postgres://`) may also be specified via [standard environment variables](https://node-postgres.com/features/connecting#environment-variables) |

## Registration Requirements

There are multiple optional registration gates, each of which can be enabled (all are disabled by default). Tenants (DIDs) must comply with whatever
requirements are enabled before they are allowed to use the server. Tenants that have not completed the registration requirements will be met with a 401. Note that registration is tracked in a database, and only SQL-based databases are supported (LevelDB is not supported). Current registration
requirements are available at the `/info` endpoint.

- **Proof of Work** (`DWN_REGISTRATION_PROOF_OF_WORK_ENABLED=true`) - new tenants must GET `/registration/proof-of-work` for a challenge, then generate a nonce that produces a string that has a sha256 hex sum starting with the specified (`complexity`) number of zeros (`0`) when added to the end of the challenge (`sha256(challenge + nonce)`). This nonce should be POSTed to `/registration/proof-of-work` with a JSON body including the `challenge`, the nonce in field `response` and `did`. Challenges expire after 5 minutes, and complexity will increase based on the number of successful proof-of-work registrations that have been completed within the last hour. This registration requirement is listed in `/info` as `proof-of-work-sha256-v0`.
- **Terms of Service** (`DWN_TERMS_OF_SERVICE_FILE_PATH=/path/to/terms-of-service.txt`) - new tenants must GET `/registration/terms-of-service` to fetch the terms. These terms must be displayed to the human end-user, who must actively accept them. When the user accepts the terms, send the sha256 hash of the accepted terms and the user's did via POST `/registration/terms-of-service`. The JSON body should have fields `termsOfServiceHash` and `did`. To change the terms, update the file and restart the server. Users that accepted the old terms will be blocked until they accept the new terms. This registration requirement is listed in `/info` as `terms-of-service`.

## Server info

the server exposes information about itself via the `/info` endpoint, which returns data in the following format:

```json
{
  "server": "@web5/dwn-server",
  "maxFileSize": 1073741824,
  "registrationRequirements": ["proof-of-work-sha256-v0", "terms-of-service"],
  "version": "0.1.5",
  "sdkVersion": "0.2.6",
  "webSocketSupport": "true"
}
```

- `server` is read from the `process.env.npm_package_name` variable that `npm` provides. If that does not exist, it will check for a `DWN_SERVER_PACKAGE_NAME` environment variable set by the user, or otherwise it will default to `@web5/dwn-server`.
- `version` and `sdkVersion` are read from the `package.json` file. It will locate the file's path either from the `process.env.npm_package_json` variable that `npm` provides. If that does not exist, it will check for a `DWN_SERVER_PACKAGE_JSON` environment variable set by the user, or otherwise it will default to `/dwn-server/package.json` which is the path within the default Docker container build.
