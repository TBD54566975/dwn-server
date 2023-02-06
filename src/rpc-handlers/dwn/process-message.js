import { dwn } from '../../dwn.js';
import { subscriptionManager } from '../../subscription-manager.js';
import { didState } from '../../did/did-loader.js';


/**
 * @param {import('../../lib/json-rpc-router.js').JsonRpcRequest} request 
 * @param {any} context
 * @returns {import('../../lib/json-rpc-router.js').JsonRpcResponse}
 */
export async function handleDwnProcessMessage(request) {
  let { message, target } = request.params;
  target ??= didState.did;
  
  const result = await dwn.processMessage(target, message);

  // TODO: this should not be blocking
  if (result.status.code === 202 && target === didState.did) {
    subscriptionManager.publish(message);
  }

  return {
    id: request.id,
    result
  };
}