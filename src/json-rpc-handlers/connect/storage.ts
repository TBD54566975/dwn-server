import { createClient as createRedisClient } from 'redis';
import fs from 'fs/promises';
import type { RedisClientType } from 'redis';
import { existsSync, mkdirSync } from 'fs';

export interface KVStore {
  connect(): Promise<void>;
  shutdown(): Promise<void>;
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>; // returns null if the key doesn't exist in the store
}

export function GetStorage(url: string): KVStore {
  const storeURI = new URL(url);
  switch (storeURI.protocol) {
    case 'file:':
      return new LocalDiskStore(storeURI.host + storeURI.pathname);
    case 'redis:':
      return new RedisStore(url);
    default:
      throw 'unsupported connect storage format';
  }
}

class LocalDiskStore {
  private path: string;

  constructor(path: string) {
    this.path = path;

    if (!existsSync(path)) {
      mkdirSync(this.path, { recursive: true });
    }
  }

  async connect(): Promise<void> {}
  async shutdown(): Promise<void> {}

  async set(key: string, value: string): Promise<void> {
    const filepath = this.path + '/' + key;
    try {
      await fs.stat(filepath);
      throw 'file already exists: ' + filepath;
    } catch (e) {
      if (e.code != 'ENOENT') {
        throw e;
      }
    }
    await fs.writeFile(filepath, value);
  }

  async get(key: string): Promise<string | null> {
    const filepath = this.path + '/' + key;
    try {
      const value = await fs.readFile(filepath);
      return value.toString();
    } catch (e) {
      if (e.code != 'ENOENT') {
        throw e;
      }

      return null;
    }
  }
}

class RedisStore {
  private client: RedisClientType;

  constructor(url: string) {
    this.client = createRedisClient({ url: url });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async shutdown(): Promise<void> {
    await this.client.disconnect();
  }

  async set(key: string, value: string): Promise<void> {
    const current = await this.client.get(key);
    if (current) {
      throw 'key already exists';
    }

    await this.client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }
}
