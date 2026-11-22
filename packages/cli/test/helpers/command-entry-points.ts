import * as account from '../../src/commands-account';
import * as ai from '../../src/commands-ai';
import * as blob from '../../src/commands-blob';
import * as core from '../../src/commands-core';
import * as deployments from '../../src/commands-deployments';
import * as flags from '../../src/commands-flags';
import * as integrations from '../../src/commands-integrations';
import * as observability from '../../src/commands-observability';
import * as routing from '../../src/commands-routing';
import build from '../../src/commands/build';
import deploy from '../../src/commands/deploy';
import dev from '../../src/commands/dev';
import env from '../../src/commands/env';
import link from '../../src/commands/link';
import list from '../../src/commands/list';
import project from '../../src/commands/project';
import type Client from '../../src/util/client';

type CommandFunction = (client: Client) => Promise<number | undefined>;

const bulk = {
  ...account,
  ...ai,
  ...blob,
  ...core,
  ...deployments,
  ...flags,
  ...integrations,
  ...observability,
  ...routing,
};

// The functions `src/index.ts` runs for each command. Most are exported from
// a `commands-<group>` module under the camelCase command name.
const ENTRY_POINTS: Readonly<Record<string, CommandFunction>> = {
  build,
  deploy,
  dev,
  env,
  link,
  list,
  project,
  budgets: bulk.budget,
  connect: bulk.connex,
  environments: bulk.target,
  login: c => bulk.login(c, { shouldParseArgs: true }),
};

export function entryPoint(name: string): CommandFunction | undefined {
  const camelCase = name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  return (
    ENTRY_POINTS[name] ??
    (bulk as unknown as Record<string, CommandFunction>)[camelCase]
  );
}
