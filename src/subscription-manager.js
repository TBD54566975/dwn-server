import { JankyIndex } from './lib/janky-index.js';

class SubscriptionManager {
  constructor() {
    this.sockets = {};
    this.filterIndex = new JankyIndex(['protocol', 'schema', 'contextId']);
  }

  add(socket, subscriptionId, filter) {
    this.sockets[socket.id] = socket;
    this.filterIndex.put(filter, { filter, socketId: socket.id, subscriptionId });
  }

  publish(message) {
    const query = SubscriptionManager.#buildQueryFromMessage(message);
    const result = this.filterIndex.query(query, (result) => {
      const numFilterKeys = Object.keys(result.document.filter).length;
      
      return numFilterKeys === result.score;
    });

    for (let { document } of result) {
      const socket = this.sockets[document.socketId];
      const payload = {
        id     : document.subscriptionId,
        result : message
      };
      
      socket.send(JSON.stringify(payload));
    }
  }

  remove(socketId) {
    this.filterIndex.delete(socketId);
    delete this.sockets[socketId];
  }

  static #buildQueryFromMessage(message) {
    const query = {};

    for (let field of ['protocol', 'schema', 'contextId']) {
      if (field in message) {
        query[field] = message[field];
      } else if (field in message.descriptor) {
        query[field] = message.descriptor[field];
      }
    }

    return query;
  }
}

export const subscriptionManager = new SubscriptionManager();