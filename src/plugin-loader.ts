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
      const instance: T = new module.default() as T;
      return instance;
    } catch (error) {
      throw new Error(`Failed to load component at ${filePath}: ${error.message}`);
    }
  }
}
