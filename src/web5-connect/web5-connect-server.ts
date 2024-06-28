import { randomUuid } from '@web5/crypto/utils';

/**
 * The Web5 Connect Request object.
 */
export type Web5ConnectRequest = any; // TODO: define type in common repo for reuse (https://github.com/TBD54566975/dwn-server/issues/138)

/**
 * The Web5 Connect Response object, which is also an OIDC ID token
 */
export type Web5ConnectResponse = any; // TODO: define type in common repo for reuse (https://github.com/TBD54566975/dwn-server/issues/138)

/**
 * The result of the setWeb5ConnectRequest() method.
 */
export type SetWeb5ConnectRequestResult = {
  /**
   * The Request URI that the wallet should use to retrieve the request object.
   */
  request_uri: string;

  /**
   * The time in seconds that the Request URI is valid for.
   */
  expires_in: number;
}

/**
 * The Web5 Connect Server is responsible for handling the Web5 Connect flow.
 */
export class Web5ConnectServer {

  private baseUrl: string;
  private dataStore = new Map(); // TODO: turn this into a TTL cache (https://github.com/TBD54566975/dwn-server/issues/138)

  /**
   * Creates a new instance of the Web5 Connect Server.
   * @param params.baseUrl The the base URL of the connect server including the port.
   *                       This is given to the Identity Provider (wallet) to fetch the Web5 Connect Request object.
   */
  public constructor({ baseUrl }: {
    baseUrl: string;
  }) {
    this.baseUrl = baseUrl;
  }

  /**
   * Stores the given Web5 Connect Request object, which is also an OAuth 2 Pushed Authorization Request (PAR) object.
   * This is the initial call to the connect server to start the Web5 Connect flow.
   */
  public async setWeb5ConnectRequest(request: Web5ConnectRequest): Promise<SetWeb5ConnectRequestResult> {
    // Generate a request URI
    const requestId = randomUuid();
    const request_uri = `${this.baseUrl}/connect/${requestId}.jwt`;
  
    // Store the Request Object.
    this.dataStore.set(`request:${requestId}`, request);
  
    return {
      request_uri,
      expires_in  : 600,
    };
  }

  /**
   * Returns the Web5 Connect Request object. The request ID can only be used once.
   */
  public async getWeb5ConnectRequest(requestId: string): Promise<Web5ConnectRequest | undefined> {
    const request = this.dataStore.get(`request:${requestId}`);

    // Delete the Request Object from the data store now that it has been retrieved.
    this.dataStore.delete(`request:${requestId}`);

    return request;
  }

  /**
   * Sets the Web5 Connect Response object, which is also an OIDC ID token.
   */
  public async setWeb5ConnectResponse(state: string, response: Web5ConnectResponse): Promise<any> {
    this.dataStore.set(`response:${state}`, response);
  }

  /**
   * Gets the Web5 Connect Response object. The `state` string can only be used once.
   */
  public async getWeb5ConnectResponse(state: string): Promise<Web5ConnectResponse | undefined> {
    const response = this. dataStore.get(`response:${state}`);

    // Delete the Response object from the data store now that it has been retrieved.
    this.dataStore.delete(`response:${state}`);

    return response;
  }
}