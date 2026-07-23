import type { Framework } from './types';
import {
  outputDirOverrides,
  defaultRoutesOverrides,
} from './manifest-registry';

/**
 * A single framework descriptor as stored in `frameworks.json`.
 *
 * It mirrors {@link Framework} but replaces the non-serializable
 * `getOutputDirName` function with an optional constant `outputDirName`
 * string, and only ever carries an array form of `defaultRoutes`. Behavioral
 * entries (dynamic output dir, or a function `defaultRoutes`) omit those
 * fields and are rehydrated from the slug-keyed override registry.
 */
export type FrameworkDescriptor = Omit<
  Framework,
  'getOutputDirName' | 'defaultRoutes'
> & {
  /**
   * Constant static output directory for this framework. Absent when the
   * framework requires a dynamic `getOutputDirName` provided by the registry.
   */
  outputDirName?: string;
  /**
   * Declarative (array) default routes. Function-based defaults are provided
   * by the registry.
   */
  defaultRoutes?: Extract<Framework['defaultRoutes'], readonly unknown[]>;
};

export type FrameworkManifest = readonly FrameworkDescriptor[];

/**
 * Turns a declarative framework descriptor into a runtime {@link Framework},
 * rehydrating the `getOutputDirName` function (and, where required, a
 * function-based `defaultRoutes`) from the descriptor's constant fields or
 * the slug-keyed override registry.
 */
export function interpretFramework(descriptor: FrameworkDescriptor): Framework {
  const { outputDirName, ...rest } = descriptor;
  const slug = descriptor.slug ?? '';

  const outputDirOverride = outputDirOverrides[slug];
  let getOutputDirName: Framework['getOutputDirName'];
  if (outputDirOverride) {
    getOutputDirName = outputDirOverride;
  } else {
    if (typeof outputDirName !== 'string') {
      throw new Error(
        `Framework "${slug || descriptor.name}" is missing "outputDirName" and has no registry override`
      );
    }
    getOutputDirName = async () => outputDirName;
  }

  const framework: Framework = {
    ...(rest as Omit<Framework, 'getOutputDirName'>),
    getOutputDirName,
  };

  const defaultRoutesOverride = defaultRoutesOverrides[slug];
  if (defaultRoutesOverride) {
    framework.defaultRoutes = defaultRoutesOverride;
  }

  return framework;
}

/**
 * Interprets a full framework manifest into runtime {@link Framework} objects.
 */
export function interpretManifest(manifest: FrameworkManifest): Framework[] {
  return manifest.map(interpretFramework);
}
