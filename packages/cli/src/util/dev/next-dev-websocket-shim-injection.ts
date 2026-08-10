import path from 'path';
import type { ProjectSettings } from '@vercel-internals/types';
import { ensureRuntimeAssetOnDisk } from '../runtime-assets';

const NEXT_DEV_WEBSOCKET_SHIM = path.join(
  __dirname,
  'next-dev-websocket-shim-preload.cjs'
);

export function injectNextDevWebSocketShimIfNeeded(
  env: NodeJS.ProcessEnv,
  command: string,
  projectSettings?: Pick<ProjectSettings, 'framework'>,
  runtimeOptions?: {
    globalRoot?: string;
    version?: string;
  }
): string | undefined {
  if (!shouldInjectNextDevWebSocketShim(command, projectSettings)) {
    return undefined;
  }

  const shimPath = ensureRuntimeAssetOnDisk(
    NEXT_DEV_WEBSOCKET_SHIM,
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
