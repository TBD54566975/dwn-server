import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

export interface KVStore {
    set(key: string, value: string): Promise<void>
    get(key: string): Promise<string>
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
    await fs.writeFile(this.path + '/' + key, value);
  }

  async get(key: string): Promise<string> {
    const value = await fs.readFile(this.path + '/' + key);
    return value.toString();
  }
}