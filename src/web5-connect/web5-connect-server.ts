import { getDialectFromUrl } from "../storage.js";
import { CryptoUtils } from '@web5/crypto';
import { SqlTtlCache } from "./sql-ttl-cache.js";

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
  public static readonly ttlInSeconds = 600;

  private baseUrl: string;
  private cache: SqlTtlCache;

  /**
   * Creates a new instance of the Web5 Connect Server.
   * @param params.baseUrl The the base URL of the connect server including the port.
   *                       This is given to the Identity Provider (wallet) to fetch the Web5 Connect Request object.
   * @param params.sqlTtlCacheUrl The URL of the SQL database to use as the TTL cache.
   */
  public static async create({ baseUrl, sqlTtlCacheUrl }: {
    baseUrl: string;
    sqlTtlCacheUrl: string;
  }): Promise<Web5ConnectServer> {
    const web5ConnectServer = new Web5ConnectServer({ baseUrl });

    // Initialize TTL cache.
    const sqlDialect = getDialectFromUrl(new URL(sqlTtlCacheUrl));
    web5ConnectServer.cache = await SqlTtlCache.create(sqlDialect);

    return web5ConnectServer;
  }

  private constructor({ baseUrl }: {
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
    const requestId = CryptoUtils.randomUuid();
    const request_uri = `${this.baseUrl}/connect/authorize/${requestId}.jwt`;
  
    // Store the Request Object.
    this.cache.insert(`request:${requestId}`, request, Web5ConnectServer.ttlInSeconds);
  
    return {
      request_uri,
      expires_in  : Web5ConnectServer.ttlInSeconds,
    };
  }

  /**
   * Returns the Web5 Connect Request object. The request ID can only be used once.
   */
  public async getWeb5ConnectRequest(requestId: string): Promise<Web5ConnectRequest | undefined> {
    const request = await this.cache.get(`request:${requestId}`);

    // Delete the Request Object from cache once it has been retrieved.
    // IMPORTANT: only delete if the object exists, otherwise there could be a race condition
    // where the object does not exist in this call but becomes available immediately after,
    // we would end up deleting it before it is successfully retrieved.
    if (request !== undefined) {
      this.cache.delete(`request:${requestId}`);
    }

    return request;
  }

  /**
   * Sets the Web5 Connect Response object, which is also an OIDC ID token.
   */
  public async setWeb5ConnectResponse(state: string, response: Web5ConnectResponse): Promise<any> {
    this.cache.insert(`response:${state}`, response, Web5ConnectServer.ttlInSeconds);
  }

  /**
   * Gets the Web5 Connect Response object. The `state` string can only be used once.
   */
  public async getWeb5ConnectResponse(state: string): Promise<Web5ConnectResponse | undefined> {
    const response = await this.cache.get(`response:${state}`);

    // Delete the Response object from the cache once it has been retrieved.
    // IMPORTANT: only delete if the object exists, otherwise there could be a race condition
    // where the object does not exist in this call but becomes available immediately after,
    // we would end up deleting it before it is successfully retrieved.
    if (response !== undefined) {
      this.cache.delete(`response:${state}`);
    }

    return response;
  }
}