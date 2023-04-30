# DWN Server <!-- omit in toc -->

Exposes a multi-tenanted DWN (aka Decentralized Web Node) through a JSON-RPC API over `http:` and `ws:`

- [JSON-RPC API](#json-rpc-api)
  - [Available Methods](#available-methods)
    - [`dwn.processMessage`](#dwnprocessmessage)
      - [Params](#params)
      - [Example Request Message](#example-request-message)
      - [Example Success Response](#example-success-response)
      - [Example Error Response](#example-error-response)
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


#### Example Request Message
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

#### Example Success Response
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

#### Example Error Response
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

#### Transporting large amounts of data
`RecordsWrite` data can be of any size. If needed, large amounts of data can be streamed to the server over http by:
* including the JSON-RPC request message in a `dwn-request` request header 
* setting the `content-type` request header to `application/octet-stream`
* sending binary data in the request body.

> 💡 Examples can be found in the [`examples`](./examples) directory. 

#### Receiving large amounts of data
`RecordsWrite` data can be of any size. `RecordsWrite` messages returned as the result of a `RecordsQuery` will include `encodedData` _if_ the `RecordsWrite` data is under `9.77KB`. Data larger than this will need to be fetched using `RecordsRead` which can be done over http. The response to a `RecordsRead` includes: 
* The JSON-RPC response message in a `dwn-response` header
* The associated data as binary in the response body.

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
| `DS_PORT`                 | Port that the server listens on                                           | `3000`  |
| `DS_MAX_RECORD_DATA_SIZE` | maximum size for `RecordsWrite` data. use `b`, `kb`, `mb`, `gb` for value | `1gb`   |
| `DS_WEBSOCKET_SERVER`     | whether to enable listening over `ws:`. values: `on`,`off`                | `on`    |