import type { ProjectSettings } from '@vercel-internals/types';
import {
  materializeRuntimeAsset,
  type RuntimeAssetOptions,
} from '../runtime-assets';

export function injectNextDevWebSocketShimIfNeeded(
  env: NodeJS.ProcessEnv,
  command: string,
  projectSettings?: Pick<ProjectSettings, 'framework'>,
  runtimeOptions?: RuntimeAssetOptions
): string | undefined {
  if (!shouldInjectNextDevWebSocketShim(command, projectSettings)) {
    return undefined;
  }

  const shimPath = materializeRuntimeAsset(
    'nextDevWebSocketPreload',
    runtimeOptions
  );

  env.NODE_OPTIONS = prependNodeRequireOption(env.NODE_OPTIONS, shimPath);

  return shimPath;
}

export function shouldInjectNextDevWebSocketShim(
  command: string,
  projectSettings?: Pick<ProjectSettings, 'framework'>
): boolean {
  return (
    projectSettings?.framework === 'nextjs' ||
    /(?:^|\s)(?:next|next\.js)(?:\s+dev)?(?:\s+-|\s*$|$)/.test(command)
  );
}

export function prependNodeRequireOption(
  nodeOptions: string | undefined,
  requirePath: string
): string {
  const requireOption = `--require ${JSON.stringify(requirePath)}`;
  return nodeOptions ? `${requireOption} ${nodeOptions}` : requireOption;
}
