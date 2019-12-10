import yaml from 'js-yaml';
import toml from '@iarna/toml';
import { PackageJson } from '../types';

/**
 * `DetectorFilesystem` is an abstract class that represents a virtual filesystem
 * to perform read-only operations on in order to detect which framework is being
 * used.
 *
 * Its abstract methods must be implemented by a subclass that perform the actual
 * FS operations. Example subclasses could be implemented as:
 *
 *  - Local filesystem, which proxies the FS operations to the equivalent `fs`
 *    module functions.
 *  - HTTP filesystem, which implements the FS operations over an HTTP server
 *    and does not require a local copy of the files.
 *  - `Files` filesystem, which operates on a virtual `Files` object (i.e. from
 *    the `glob()` function) which could include `FileFsRef`, `FileBlob`, etc.
 *
 * This base class implements various helper functions for common tasks (i.e.
 * read and parse a JSON file). It also includes caching for all FS operations
 * so that multiple detector functions de-dup read operations on the same file
 * to reduce network/filesystem overhead.
 *
 * **NOTE:** It's important that all instance methods in this base class are
 * bound to `this` so that the `fs` object may be destructured in the detector
 * functions. The easiest way to do this is to use the `=` syntax when defining
 * methods in this class definition.
 */
export default abstract class DetectorFilesystem {
  protected abstract _readFile(name: string): Promise<Buffer>;
  protected abstract _exists(name: string): Promise<boolean>;

  private existsCache: Map<string, Promise<boolean>>;
  private readFileCache: Map<string, Promise<Buffer>>;
  private readJsonCache: Map<string, Promise<any>>;

  constructor() {
    this.existsCache = new Map();
    this.readFileCache = new Map();
    this.readJsonCache = new Map();
  }

  public exists = async (name: string): Promise<boolean> => {
    let p = this.existsCache.get(name);
    if (!p) {
      p = this._exists(name);
      this.existsCache.set(name, p);
    }
    return p;
  };

  public readFile = async (name: string): Promise<Buffer> => {
    let p = this.readFileCache.get(name);
    if (!p) {
      p = this._readFile(name);
      this.readFileCache.set(name, p);
    }
    return p;
  };

  public readJson = async <T>(name: string): Promise<T> => {
    let p = this.readJsonCache.get(name);
    if (!p) {
      p = this.readFile(name).then(d => JSON.parse(d.toString('utf8')));
      this.readJsonCache.set(name, p);
    }
    return p;
  };

  public readFileOrNull = async (name: string): Promise<Buffer | null> => {
    return nullEnoent(this.readFile(name));
  };

  public readJsonOrNull = async <T>(name: string): Promise<T | null> => {
    return nullEnoent(this.readJson<T>(name));
  };

  public readPackageJson = async (): Promise<PackageJson | null> => {
    return await this.readJsonOrNull<PackageJson>('package.json');
  };

  public readConfigFile = async <T>(...names: string[]): Promise<T | null> => {
    for (const name of names) {
      const data = await this.readFileOrNull(name);
      if (data) {
        const str = data.toString('utf8');
        if (name.endsWith('.json')) {
          return JSON.parse(str);
        } else if (name.endsWith('.toml')) {
          return (toml.parse(str) as unknown) as T;
        } else if (name.endsWith('.yaml') || name.endsWith('.yml')) {
          return yaml.safeLoad(str, { filename: name });
        }
      }
    }
    return null;
  };

  public hasDependency = async (name: string): Promise<boolean> => {
    const pkg = await this.readPackageJson();
    const { dependencies = {}, devDependencies = {} } = pkg || {};
    return name in dependencies || name in devDependencies;
  };
}

async function nullEnoent<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}
