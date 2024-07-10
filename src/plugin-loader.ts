/**
 * A utility class for dynamically loading plugins from file paths.
 */
export class PluginLoader {
  /**
   * Dynamically loads a plugin from a file path by invoking the argument-less constructor of the default exported class.
   */
  public static async loadPlugin<T>(filePath: string): Promise<T> {
    try {
      const module = await import(filePath);

      // Check if the default export is a class
      if (typeof module.default === 'function') {
        const instance: T = new module.default() as T;
        return instance;
      } else {
        throw new Error(`Default export at ${filePath} is not a class.`);
      }
    } catch (error) {
      throw new Error(`Failed to load component at ${filePath}: ${error.message}`);
    }
  }
}
