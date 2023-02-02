/**
 * @param {import('../../lib/json-rpc-router.js').JsonRpcRequest} request 
 * @param {any} context
 * @returns {import('../../lib/json-rpc-router.js').JsonRpcResponse}
 */
export async function handleGetList(request) {
  return {
    id     : request.id,
    result : {
      aggregators: []
    }
  };
}