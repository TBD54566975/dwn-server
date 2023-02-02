/**
 * @typedef {Object} JsonRpcRequest
 * @property {'2.0'} jsonrpc
 * @property {String} method
 * @property {any} [params]
 * @property {String} id
 */

/**
 * @typedef {Object} JsonRpcResponse 
 * @property {String} id
 * @property {any} [result]
 * @property {JsonRpcError} [error]
 */

/**
 * @typedef {Object} JsonRpcError
 * @property {number} code
 * @property {message} string
 * @property {any} [data]
 */


/**
 * @callback JsonRpcHandler
 * @param {JsonRpcRequest} request
 * @param {Object} context
 * @returns {JsonRpcResponse}
 */

export class JsonRpcRouter {
  constructor() {
    this.methodHandlers = {};
  }

  /**
   * 
   * @param {String} methodName 
   * @param {JsonRpcHandler} handler 
   */
  on(methodName, handler) {
    this.methodHandlers[methodName] = handler;
  }

  /**
   * 
   * @param {JsonRpcRequest} rpcRequest 
   * @param {any} context 
   */
  async handle(rpcRequest, context = {}) {
    /** @type {JsonRpcHandler} */
    const handler = this.methodHandlers[rpcRequest.method];

    return await handler(rpcRequest, context);
  }
}