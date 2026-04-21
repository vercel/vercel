import type {
  BuildOptions,
  BuildResultV3,
  ShouldServeOptions,
  StartDevServerOptions,
  StartDevServerResult,
} from '@vercel/build-utils';
import { buildDotnetServer } from './build';
import { startDotnetDevServer } from './dev-server';

// .NET is a standalone HTTP server — it handles all routes, not just the entrypoint.
// The default shouldServe only matches when requestPath === entrypoint (e.g. "Program.cs"),
// which causes all real routes (/, /api/info, etc.) to fall through to the static file server.
export function shouldServe(_options: ShouldServeOptions): boolean {
  return true;
}
export const version = 3;

export async function build(options: BuildOptions): Promise<BuildResultV3> {
  return buildDotnetServer(options);
}

export async function startDevServer(
  options: StartDevServerOptions
): Promise<StartDevServerResult> {
  return startDotnetDevServer(options);
}
