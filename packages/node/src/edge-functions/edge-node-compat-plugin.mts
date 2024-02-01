import BufferImplementation from 'buffer';
import EventsImplementation from 'events';
import AsyncHooksImplementation from 'async_hooks';
import AssertImplementation from 'assert';
import UtilImplementation from 'util';
import type { Plugin } from 'esbuild';

const SUPPORTED_NODE_MODULES = [
  'buffer',
  'events',
  'assert',
  'util',
  'async_hooks',
] as const;

const getSupportedNodeModuleRegex = () =>
  new RegExp(`^(?:node:)?(?:${SUPPORTED_NODE_MODULES.join('|')})$`);

function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const res: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    res[key] = obj[key];
  }
  return res as Pick<T, K>;
}

const NativeModuleMap = () => {
  const mods: Record<typeof SUPPORTED_NODE_MODULES[number], unknown> = {
    buffer: pick(BufferImplementation, [
      'constants',
      'kMaxLength',
      'kStringMaxLength',
      'Buffer',
      'SlowBuffer',
    ]),
    events: pick(EventsImplementation, [
      'EventEmitter',
      'captureRejectionSymbol',
      'defaultMaxListeners',
      'errorMonitor',
      'listenerCount',
      'on',
      'once',
    ]),
    async_hooks: pick(AsyncHooksImplementation, [
      'AsyncLocalStorage',
      'AsyncResource',
    ]),
    assert: pick(AssertImplementation, [
      'AssertionError',
      'deepEqual',
      'deepStrictEqual',
      'doesNotMatch',
      'doesNotReject',
      'doesNotThrow',
      'equal',
      'fail',
      'ifError',
      'match',
      'notDeepEqual',
      'notDeepStrictEqual',
      'notEqual',
      'notStrictEqual',
      'ok',
      'rejects',
      'strict',
      'strictEqual',
      'throws',
    ]),
    util: pick(UtilImplementation, [
      '_extend' as any,
      'callbackify',
      'format',
      'inherits',
      'promisify',
      'types',
    ]),
  };
  return new Map(Object.entries(mods));
};

const NODE_COMPAT_NAMESPACE = 'vercel-node-compat';

export class NodeCompatBindings {
  private bindings = new Map<
    string,
    {
      name: string;
      modulePath: string;
      value: unknown;
    }
  >();

  use(modulePath: `node:${string}`) {
    const stripped = modulePath.replace(/^node:/, '');
    const name = `__vc_node_${stripped}__`;
    if (!this.bindings.has(modulePath)) {
      const value = NativeModuleMap().get(stripped);
      if (value === undefined) {
        throw new Error(`Could not find module ${modulePath}`);
      }
      this.bindings.set(modulePath, {
        modulePath: modulePath,
        name,
        value,
      });
    }
    return name;
  }

  getContext(): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    for (const binding of this.bindings.values()) {
      context[binding.name] = binding.value;
    }
    return context;
  }
}

/**
 * Allows to enable Node.js compatibility by detecting namespaced `node:`
 * imports and producing metadata to bind global variables for each.
 * It requires from the consumer to add the imports.
 */
export function createNodeCompatPlugin() {
  const bindings = new NodeCompatBindings();
  const plugin: Plugin = {
    name: 'vc-node-compat',
    setup(b) {
      b.onResolve({ filter: getSupportedNodeModuleRegex() }, async args => {
        const importee = args.path.replace('node:', '');
        if (!SUPPORTED_NODE_MODULES.includes(importee as any)) {
          return;
        }

        return {
          namespace: NODE_COMPAT_NAMESPACE,
          path: args.path,
        };
      });

      b.onLoad(
        { filter: /.+/, namespace: NODE_COMPAT_NAMESPACE },
        async args => {
          const fullName = args.path.startsWith('node:')
            ? (args.path as `node:${string}`)
            : (`node:${args.path}` as const);
          const globalName = bindings.use(fullName);

          return {
            contents: `module.exports = ${globalName};`,
            loader: 'js',
          };
        }
      );
    },
  };
  return {
    plugin,
    bindings,
  };
}
