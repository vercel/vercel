import { getInternalServiceFunctionPath } from '@vercel/build-utils';
import type { BuildOptions, BuildResultV2 } from '@vercel/build-utils';

export const version = 2;

function normalizeCommand(command: unknown): string[] | undefined {
  if (typeof command === 'string') {
    return [command];
  }
  if (
    Array.isArray(command) &&
    command.every(item => typeof item === 'string')
  ) {
    return command;
  }
  return undefined;
}

export async function build(options: BuildOptions): Promise<BuildResultV2> {
  const handler =
    typeof options.config.handler === 'string'
      ? options.config.handler
      : typeof options.config.image === 'string'
        ? options.config.image
        : options.entrypoint;

  if (!handler) {
    throw new Error('Container service must specify an image entrypoint.');
  }

  const command = normalizeCommand(options.config.command);

  const outputPath = options.service?.name
    ? getInternalServiceFunctionPath(options.service.name).replace(/^\//, '')
    : 'index';

  return {
    output: {
      [outputPath]: {
        // Emit a Lambda-typed output with `runtime: 'container'`. The build
        // container keys off `type === 'Lambda' && runtime === 'container'`
        // (vercel/api#74661) to collect container image functions, so the
        // output must use the `Lambda` discriminator rather than a bespoke type.
        type: 'Lambda',
        files: {},
        handler,
        runtime: 'container',
        environment: {},
        ...(command ? { command } : {}),
      } as any,
    },
  };
}
