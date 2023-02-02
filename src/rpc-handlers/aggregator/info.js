import { didState } from '../../did/did-loader.js';

/**
 * @param {import('../../lib/json-rpc-router.js').JsonRpcRequest} request 
 * @param {any} context
 * @returns {import('../../lib/json-rpc-router.js').JsonRpcResponse}
 */
export async function handleGetInfo(request) {
  return {
    id     : request.id,
    result : {
      did: didState.did
    }
  };
}