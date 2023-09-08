import type { Server } from 'http';
import type { Socket } from 'net';

const SOCKET_IDLE_SYMBOL = Symbol('idle');

export class HttpServerShutdownHandler {
  private tcpSockets: { [socketId: number]: Socket };
  private tcpSocketId: number;
  private server: Server;
  private stopping: boolean;

  constructor(server: Server) {
    this.tcpSockets = {};
    this.tcpSocketId = 1;
    this.server = server;
    this.stopping = false;

    // This event is emitted when a new TCP stream is established
    this.server.on('connection', (socket) => {
      // set socket to idle. this same socket will be accessible within the `http.on('request', (req, res))` event listener
      // as `request.connection`
      socket[SOCKET_IDLE_SYMBOL] = true;
      const tcpSocketId = this.tcpSocketId++;
      this.tcpSockets[tcpSocketId] = socket;

      // This event is emitted when a tcp stream is `destroy`ed
      socket.on('close', () => {
        delete this.tcpSockets[tcpSocketId];
      });
    });

    // Emitted each time there is a request. There may be multiple requests
    // per connection (in the case of HTTP Keep-Alive connections).
    this.server.on('request', (request, response) => {
      const { socket } = request;

      // set __idle to false because this socket is being used for an incoming request
      socket[SOCKET_IDLE_SYMBOL] = false;

      // Emitted when the response has been sent. More specifically, this event is emitted
      // when the last segment of the response headers and body have been handed off to the
      // operating system for transmission over the network.
      // It does not imply that the client has received anything yet.
      response.on('finish', () => {
        // set __idle back to true because the socket has finished facilitating a request. This socket may be used again without being
        // destroyed if keep-alive is being leveraged
        socket[SOCKET_IDLE_SYMBOL] = true;

        if (this.stopping) {
          socket.destroy();
        }
      });
    });
  }

  stop(callback): void {
    this.stopping = true;

    // Stops the server from accepting new connections and keeps existing connections. This function is asynchronous,
    // the server is finally closed when all connections are ended and the server emits a 'close' event.
    // The optional callback will be called once the 'close' event occurs. Unlike that event, it will be
    // called with an Error as its only argument if the server was not open when it was closed.
    this.server.close(() => {
      this.tcpSocketId = 0;
      this.stopping = false;
      callback();
    });

    // close all idle sockets. the remaining sockets facilitating active requests
    // will be closed after they've served responses back.
    for (const tcpSocketId in this.tcpSockets) {
      const socket = this.tcpSockets[tcpSocketId];

      if (socket[SOCKET_IDLE_SYMBOL]) {
        socket.destroy();
      }
    }
  }
}
