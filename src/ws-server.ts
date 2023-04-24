import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { rpcRouter } from './rpc-router.js';

export const wsServer = new WebSocketServer({ noServer: true });

wsServer.on('connection', function(socket, _request, _client) {
  socket.id = uuidv4();
  socket.isAlive = true;

  // Pong messages are automatically sent in response to ping messages as required by
  // the websocket spec. So, no need to send explicit pongs from browser
  socket.on('pong', function() {
    this.isAlive = true;
  });

  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();

  socket.on('message', async function(dataBytes) {
    // deserialize bytes into JSON object
    let rpcRequest;

    try {
      const rpcRequestString = textDecoder.decode(dataBytes);
      rpcRequest = JSON.parse(rpcRequestString);
    } catch(e) {
      console.log(e);
      const response = { error: e.message };
      const responseString = JSON.stringify(response);

      const responseBytes = textEncoder.encode(responseString);
      return socket.send(responseBytes);
    }

    const result = await rpcRouter.handle(rpcRequest, { transport: 'ws' });
    const resultString = JSON.stringify(result);

    socket.send(resultString);
  });
});

// Sometimes connections between client <-> server can get borked in such a way that
// leaves both unaware of the borkage. ping messages can be used as a means to verify
// that the remote endpoint is still responsive. Server will ping each socket every 30s
// if a pong hasn't received from a socket by the next ping, the server will terminate
// the socket connection
const heartbeatInterval = setInterval(function () {
  wsServer.clients.forEach(function (socket) {
    if (socket['isAlive'] === false) {
      return socket.terminate();
    }

    socket['isAlive'] = false;
    socket.ping();
  });
}, 30_000);

wsServer.on('close', function close() {
  clearInterval(heartbeatInterval);
});