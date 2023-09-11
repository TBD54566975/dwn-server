import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

export interface KVStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>; // returns null if the key doesn't exist in the store
}

export class LocalDiskStore {
  private path: string;

  constructor(path: string) {
    this.path = path;

    if (!existsSync(path)) {
      mkdirSync(this.path, { recursive: true });
    }
  }

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
    try {
      const value = await fs.readFile(this.path + '/' + key);
      return value.toString();
    } catch (e) {
      if (e.code != 'ENOENT') {
        throw e;
      }

      return null;
    }
  }
}
