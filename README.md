# DWN Server <!-- omit in toc -->

Exposes a multi-tenanted DWN (aka Decentralized Web Node) through a JSON-RPC API over `http:` and `ws:`

- [JSON-RPC API](#json-rpc-api)
  - [Available Methods](#available-methods)
    - [`dwn.processMessage`](#dwnprocessmessage)
      - [Params](#params)
      - [Transporting large amounts of data](#transporting-large-amounts-of-data)
      - [Receiving large amounts of data](#receiving-large-amounts-of-data)
- [Running The Server](#running-the-server)
  - [Running Locally for Development](#running-locally-for-development)
- [Hosted examples you can use:](#hosted-examples-you-can-use)
- [Configuration](#configuration)


# JSON-RPC API

[JSON-RPC](https://www.jsonrpc.org/specification) is a lightweight remote procedure call (RPC) protocol that uses JSON as a data format for exchanging information between a client and a server over a network. JSON-RPC is language-independent and transport-agnostic which makes it usable in a variety of contexts (e.g. browser, server-side)

With JSON-RPC, a client sends a request message to a server over a network, and the server responds with a response message. 

The request message consists of: 
* a method name (`method`)
* a set of parameters (`params`)
* an identifier (`id`). 

The response message contains:
* the same identifier that was sent with the request message (`id`)
* the result of the method invocation (`result`)
* an error message if the method invocation failed (`error`)

## Available Methods
### `dwn.processMessage`

Used to send DWeb Messages to the server.

#### Params
| Property      | Required (Y/N) | Description                                                               |
| ------------- | -------------- | ------------------------------------------------------------------------- |
| `target`      | Y              | The DID that the message is intended for                                  |
| `message`     | Y              | The DWeb Message                                                          |
| `encodedData` | N              | Data associated to the message (e.g. data associated to a `RecordsWrite`) |


> 💡 **TODO**: Add example

#### Transporting large amounts of data
Data in `RecordsWrite` messages can be of any size, allowing for large amounts of data to be included. If needed, large amounts of data can be streamed to the server over http by including the JSON-RPC request message in a `dwn-request` http request header and providing the associated data in the request body as either:
* binary (`content-type: application/octet-stream`) 
* multipart form-data (`content-type: multipart/form-data`). 

Examples can be found in the `examples` directory. 
> 💡 **TODO**: Add examples in `examples` directory

#### Receiving large amounts of data
Data in `RecordsWrite` messages can be of any size, allowing for large amounts of data to be included. `RecordsWrite` messages returned as the result of a `RecordsQuery` will include `encodedData` _if_ the data associated to a given `RecordsWrite` is under `9.77KB`. Data larger than this will need to be fetched using `RecordsRead` which can be done over http. The response includes the json-rpc response message in a `dwn-response` header and the associated data as binary in the response body.

Examples can be found in the `examples` directory. 
> 💡 **TODO**: Add examples in `examples` directory

# Running The Server
`docker run -p 3000:3000 ghcr.io/tbd54566975/dwn-server:main`

This can run on services like AWS lightsail, a VPS, desktop.

## Running Locally for Development
```bash
git clone https://github.com/TBD54566975/dwn-server.git
cd dwn-server
npm install && npm run compile
node dist/src/main.js
```

# Hosted examples you can use:
| Location  | URL                                                                  |
| --------- | -------------------------------------------------------------------- |
| Australia | `dwn-aggregator.faktj7f1fndve.ap-southeast-2.cs.amazonlightsail.com` |
| India     | `dwn-india.vtv94qck5sjvq.ap-south-1.cs.amazonlightsail.com`          |
| USA       | `dwn-usa-1.ue8cktdq71va0.us-east-2.cs.amazonlightsail.com`           |


# Configuration
Configuration can be set using environment variables

| Env Var                   | Description                                                               | Default |
| ------------------------- | ------------------------------------------------------------------------- | ------- |
| `DS_PORT`                 | Port that the server listens on                                           | 3000    |
| `DS_MAX_RECORD_DATA_SIZE` | maximum size for `RecordsWrite` data. use `b`, `kb`, `mb`, `gb` for value | 1gb     |
| `DS_WEBSOCKET_SERVER`     | whether to enable listening over `ws:`. values: `on`,`off`                | `on`    |