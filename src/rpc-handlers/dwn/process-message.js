import { base64url } from '@scure/base';
import { DataStream } from '@tbd54566975/dwn-sdk-js';
import { dwn } from '../../dwn.js';
import { subscriptionManager } from '../../subscription-manager.js';
import { didState } from '../../did/did-loader.js';


/**
 * @param {import('../../lib/json-rpc-router.js').JsonRpcRequest} request 
 * @param {any} context
 * @returns {import('../../lib/json-rpc-router.js').JsonRpcResponse}
 */
export async function handleDwnProcessMessage(request) {
  let { message, target, data: encodedData } = request.params;
  
  target ??= didState.did;

  // if data is provided, jam it into a ReadableStream. monkeypatch 
  let dataStream = encodedData ? DataStream.fromBytes(base64url.decode(encodedData)) : undefined;
  
  const result = await dwn.processMessage(target, message, dataStream);

  // TODO: this should not be blocking
  if (result.status.code === 202 && target === didState.did) {
    // jam `encodedData` into message to match current RecordsQuery behavior
    if (encodedData) {
      message.encodedData = encodedData;
    }
    
    subscriptionManager.publish(message);
  }

  return {
    id: request.id,
    result
  };
}