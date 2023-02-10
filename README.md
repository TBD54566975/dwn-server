# DWN Server <!-- omit in toc -->

This is a server wrapped around a decentralized web node you can run anywhere that you can run a container (or run it from node.js). 

- [Running](#running)
  - [Running Locally for Development](#running-locally-for-development)
- [Hosted examples you can use:](#hosted-examples-you-can-use)
- [JSON RPC Methods](#json-rpc-methods)
  - [`dwn.processMessage`](#dwnprocessmessage)
    - [Description](#description)
    - [Params](#params)
    - [Available Transports](#available-transports)
  - [`dwn.subscribe`](#dwnsubscribe)
    - [Description](#description-1)
    - [Params](#params-1)
    - [Response](#response)
    - [Available Transports](#available-transports-1)
  - [`aggregator.list`](#aggregatorlist)
    - [Description](#description-2)
    - [Params](#params-2)
    - [Response](#response-1)
    - [Available Transports](#available-transports-2)
  - [`aggregator.info`](#aggregatorinfo)
    - [Description](#description-3)
    - [Params](#params-3)
    - [Response](#response-2)
    - [Available Transports](#available-transports-3)

# Running

`docker run -p 3000:3000 ghcr.io/tbd54566975/dwn-server:main`

This can run on services like AWS lightsail, a VPS, desktop.

## Running Locally for Development
```bash
git clone https://github.com/TBD54566975/dwn-server.git
cd dwn-server
npm install
node src/index.js
```

# Hosted examples you can use:

* USA: `dwn-usa-1.ue8cktdq71va0.us-east-2.cs.amazonlightsail.com`
* Australia: `dwn-aggregator.faktj7f1fndve.ap-southeast-2.cs.amazonlightsail.com `
* India: `dwn-india.vtv94qck5sjvq.ap-south-1.cs.amazonlightsail.com`
# JSON RPC Methods

## `dwn.processMessage`
### Description
processes/stores the provided message. 


### Params
| property  | description                                                        | required (y/n) |
| --------- | ------------------------------------------------------------------ | -------------- |
| `message` | the message to be processed                                        | y              |
| `target`  | the DID to target. Defaults to the aggregators DID if not provided | n              |


### Available Transports
* http
* ws

## `dwn.subscribe`

### Description
subscribes to a feed of messages that match the filter provided

### Params


| property | description                                                               | required (y/n) |
| -------- | ------------------------------------------------------------------------- | -------------- |
| `filter` | a JSON object that is used to determine what messages will be sent to you | y              |


### Response


### Available Transports
* ws

## `aggregator.list`

### Description
Returns a list of known aggregators

### Params
N/A

### Response

### Available Transports
* http
* ws

## `aggregator.info`

### Description
returns info about self

### Params
N/A

### Response

### Available Transports
* http
* ws
