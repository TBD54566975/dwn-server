# DWN Server <!-- omit in toc -->

This is a server wrapped around a decentralized web node you can run anywhere that you can run a container (or run it from node.js). 

# API stuff

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
