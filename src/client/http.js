export class HttpClient {
  constructor(host) {
    this.host = host;
  }

  static create(host) {
    return new HttpClient(host);
  }

  async send(jsonRpcRequest) {
    const resp = await fetch(this.host, {
      method : 'POST',
      body   : JSON.stringify(jsonRpcRequest)
    });

    return await resp.json();
  }
}