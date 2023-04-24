import type { Express } from 'express';
import { Server } from 'http';
import { Socket } from 'net';

export class HttpServer {
  private app: Express;
  private tcpSockets: { [socketId: number]: Socket };
  private tcpSocketId: number;
  private http: Server;
  private stopping: boolean;
  private keepAliveTimeoutMillis: number;
  private headersTimeoutMillis: number;

  constructor(app: Express, keepAliveTimeoutMillis?: number, headersTimeoutMillis?: number) {
    this.app = app;
    this.tcpSockets = {};
    this.tcpSocketId = 1;
    this.http = undefined;
    this.stopping = false;
    this.keepAliveTimeoutMillis = keepAliveTimeoutMillis;
    this.headersTimeoutMillis = headersTimeoutMillis;
  }

  listen(port, callback) {
    this.http = this.app.listen(port, callback);

    if (this.keepAliveTimeoutMillis) {
      this.http.keepAliveTimeout = this.keepAliveTimeoutMillis;
    }

    if (this.headersTimeoutMillis) {
      this.http.headersTimeout = this.headersTimeoutMillis;
    }

    // This event is emitted when a new TCP stream is established
    this.http.on('connection', socket => {

      // set socket to idle. this same socket will be accessible within the `http.on('request', (req, res))` event listener
      // as `request.connection`
      socket['__idle'] = true;
      const tcpSocketId = this.tcpSocketId++;
      this.tcpSockets[tcpSocketId] = socket;

      // This event is emitted when a tcp stream is `destroy`ed
      socket.on('close', () => {
        delete this.tcpSockets[tcpSocketId];
      });
    });

    // Emitted each time there is a request. There may be multiple requests
    // per connection (in the case of HTTP Keep-Alive connections).
    this.http.on('request', (request, response) => {
      const { socket } = request;

      // set __idle to false because this socket is being used for an incoming request
      socket['__idle'] = false;

      // Emitted when the response has been sent. More specifically, this event is emitted
      // when the last segment of the response headers and body have been handed off to the
      // operating system for transmission over the network.
      // It does not imply that the client has received anything yet.
      response.on('finish', () => {

        // set __idle back to true because the socket has finished facilitating a request. This socket may be used again without being
        // destroyed if keep-alive is being leveraged
        socket['__idle'] = true;

        if (this.stopping) {
          socket.destroy();
        }
      });
    });
  }

  onUpgrade(callback) {
    this.http.on('upgrade', (request, socket, firstPacket) => {
      callback(request, socket, firstPacket);
    });
  }

  stop(callback) {
    this.stopping = true;

    // Stops the server from accepting new connections and keeps existing connections. This function is asynchronous,
    // the server is finally closed when all connections are ended and the server emits a 'close' event.
    // The optional callback will be called once the 'close' event occurs. Unlike that event, it will be
    // called with an Error as its only argument if the server was not open when it was closed.
    this.http.close(() => {
      this.tcpSocketId = 0;
      this.stopping = false;
      callback();
    });

    // close all idle sockets. the remaining sockets facilitating active requests
    // will be closed after they've served responses back.
    for (const tcpSocketId in this.tcpSockets) {
      const socket = this.tcpSockets[tcpSocketId];

      if (socket['__idle']) {
        socket.destroy();
      }
    }
  }
}