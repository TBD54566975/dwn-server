import { subscriptionManager } from '../../subscription-manager.js';

/**
 * 
 * @param {import('../../lib/json-rpc-router.js').JsonRpcRequest} request 
 * @param {any} context
 * @returns {import('../../lib/json-rpc-router.js').JsonRpcResponse}
 */
export async function handleSubscribe(request, context) {
  if (context.transport === 'http') {
    return {
      id    : request.id,
      error : {
        code    : 0,
        message : 'subscribe not supported over http'
      }
    };
  }
  
  const { filter } = request.params;
  subscriptionManager.add(context.socket, request.id, filter);

  return {
    id     : request.id,
    result : 'OK'
  };
}