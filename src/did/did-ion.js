import { DID, generateKeyPair } from '@decentralized-identity/ion-tools';


export class DIDIon {
  /**
   * 
   * @param {object} options
   * @property {string} [options.serviceEndpoint] - optional serviceEndpoint to include in DID Doc
   * @returns {GenerateDIDResult}
   */
  static async generate(options = {}) {
    const { publicJwk, privateJwk } = await generateKeyPair('secp256k1');
    const authnKeyId = 'key-1';

    const createOptions = {
      publicKeys: [
        {
          id           : authnKeyId,
          type         : 'JsonWebKey2020',
          publicKeyJwk : publicJwk,
          purposes     : ['authentication']
        }
      ],
    };

    if (options.serviceEndpoint) {
      createOptions.services = [
        {
          'id'              : 'dwn',
          'type'            : 'DecentralizedWebNode',
          'serviceEndpoint' : {
            'nodes': [ options.serviceEndpoint ]
          }
        }
      ];
    }

    const did = new DID({ content: createOptions });
    const longFormDID = await did.getURI('long');
    const ops = await did.getAllOperations();

    privateJwk.alg = 'ES256K';
    privateJwk.kid = authnKeyId;
    
    publicJwk.alg = 'ES256K';
    publicJwk.kid = authnKeyId;

    const keys = {
      [authnKeyId]: {
        privateJwk,
        publicJwk
      }
    };

    return {
      did: longFormDID,
      keys,
      ops,
    };
  }
}