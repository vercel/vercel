#!/usr/bin/env python3
"""Create isolated CLI branches from origin/main, one per protection key. Run from repo root."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

INDEX_PATCH = r"""--- a/packages/cli/src/commands/project/index.ts
+++ b/packages/cli/src/commands/project/index.ts
@@ -14,6 +14,7 @@ import rm from './rm';
 import getOidcToken from './token';
 import speedInsights from './speed-insights';
 import webAnalytics from './web-analytics';
+import protection from './protection';
 import {
   accessGroupsSubcommand,
   addSubcommand,
@@ -23,6 +24,7 @@ import {
   listSubcommand,
   membersSubcommand,
   projectCommand,
+  protectionSubcommand,
   removeSubcommand,
   speedInsightsSubcommand,
   tokenSubcommand,
@@ -42,6 +44,7 @@ const COMMAND_CONFIG = {
   add: getCommandAliases(addSubcommand),
   'access-summary': getCommandAliases(accessSummarySubcommand),
   checks: getCommandAliases(checksSubcommand),
+  protection: getCommandAliases(protectionSubcommand),
   remove: getCommandAliases(removeSubcommand),
   token: getCommandAliases(tokenSubcommand),
   speedInsights: getCommandAliases(speedInsightsSubcommand),
@@ -146,6 +149,19 @@ export default async function main(client: Client) {
       }
       telemetry.trackCliSubcommandAccessGroups(subcommandOriginal);
       return accessGroups(client, args);
+    case 'protection':
+      if (needHelp) {
+        telemetry.trackCliFlagHelp('project', subcommandOriginal);
+        return printHelp(protectionSubcommand);
+      }
+      telemetry.trackCliSubcommandProtection(
+        args[0] === 'enable'
+          ? 'protection enable'
+          : args[0] === 'disable'
+            ? 'protection disable'
+            : subcommandOriginal
+      );
+      return protection(client, args);
     case 'webAnalytics':
       if (needHelp) {
         telemetry.trackCliFlagHelp('project', subcommandOriginal);
"""

TELEMETRY_PATCH = r"""--- a/packages/cli/src/util/telemetry/commands/project/index.ts
+++ b/packages/cli/src/util/telemetry/commands/project/index.ts
@@ -69,6 +69,13 @@ export class ProjectTelemetryClient
     });
   }
 
+  trackCliSubcommandProtection(actual: string) {
+    this.trackCliSubcommand({
+      subcommand: 'protection',
+      value: actual,
+    });
+  }
+
   trackCliSubcommandWebAnalytics(actual: string) {
     this.trackCliSubcommand({
       subcommand: 'web-analytics',
"""

AGENT_OUTPUT_PATCH = r"""--- a/packages/cli/src/util/agent-output.ts
+++ b/packages/cli/src/util/agent-output.ts
@@ -452,6 +452,7 @@ export type ExitWithNonInteractiveErrorVariant =
   | 'members'
   | 'access-groups'
   | 'access-summary'
+  | 'protection'
   | 'speed-insights'
   | 'web-analytics'
   | 'checks'
@@ -478,25 +479,30 @@ function buildNextStepsForProjectSubcommands(
             template: 'project access-summary <name>' as const,
             when: 'Show role counts by project name (replace <name>)',
           }
-        : variant === 'speed-insights'
+        : variant === 'protection'
           ? {
-              template: 'project speed-insights <name>' as const,
-              when: 'Enable Speed Insights by project name (replace <name>)',
+              template: 'project protection <name>' as const,
+              when: 'Show deployment protection by project name (replace <name>)',
             }
-          : variant === 'web-analytics'
+          : variant === 'speed-insights'
             ? {
-                template: 'project web-analytics <name>' as const,
-                when: 'Enable Web Analytics by project name (replace <name>)',
+                template: 'project speed-insights <name>' as const,
+                when: 'Enable Speed Insights by project name (replace <name>)',
               }
-            : variant === 'checks'
+            : variant === 'web-analytics'
               ? {
-                  template: 'project checks add <name>' as const,
-                  when: 'Create a deployment check by project name (replace <name>)',
+                  template: 'project web-analytics <name>' as const,
+                  when: 'Enable Web Analytics by project name (replace <name>)',
                 }
-              : {
-                  template: 'project members <name>' as const,
-                  when: 'List members by project name (replace <name>)',
-                };
+              : variant === 'checks'
+                ? {
+                    template: 'project checks add <name>' as const,
+                    when: 'Create a deployment check by project name (replace <name>)',
+                  }
+                : {
+                    template: 'project members <name>' as const,
+                    when: 'List members by project name (replace <name>)',
+                  };
   return [
     {
       command: buildCommandWithGlobalFlags(client.argv, 'link'),
"""

SUBCOMMANDS_PATCH = r"""    accessGroupsSubcommand,
    protectionSubcommand,
    webAnalyticsSubcommand,"""


def run(cmd: list[str], check: bool = True, **kw) -> int:
    r = subprocess.run(cmd, cwd=ROOT, **kw)
    if check and r.returncode != 0:
        raise subprocess.CalledProcessError(r.returncode, cmd)
    return r.returncode


def git_write_patch(name: str, content: str) -> None:
    p = ROOT / f".tmp-{name}.patch"
    p.write_text(content)
    try:
        run(["git", "apply", str(p)])
    finally:
        p.unlink(missing_ok=True)


def insert_protection_subcommand(command_ts: str, block: str) -> str:
    needle = "export const accessGroupsSubcommand = {"
    if needle not in command_ts:
        raise SystemExit("unexpected command.ts: missing accessGroupsSubcommand")
    return command_ts.replace(needle, block + "\n\n" + needle, 1)


def insert_subcommands_list(command_ts: str) -> str:
    old = """    accessGroupsSubcommand,
    webAnalyticsSubcommand,"""
    if old not in command_ts:
        raise SystemExit("unexpected command.ts: missing subcommands chunk")
    return command_ts.replace(old, SUBCOMMANDS_PATCH, 1)


# --- protection.ts bodies (shared header/footer via template) ---

COMMON_HEADER = '''import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { protectionSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import chalk from 'chalk';
import type { {{TYPES_IMPORT}} } from '@vercel-internals/types';

const PROTECTION_ACTIONS = ['enable', 'disable'] as const;
type ProtectionAction = (typeof PROTECTION_ACTIONS)[number];
'''

PROTECTION_KEYS = """const PROTECTION_KEYS = [
  'passwordProtection',
  'ssoProtection',
  'skewProtection',
  'customerSupportCodeVisibility',
  'gitForkProtection',
  'protectionBypass',
] as const;
"""

COMMON_MID = """
function isProtectionAction(v: string | undefined): v is ProtectionAction {
  return !!v && (PROTECTION_ACTIONS as readonly string[]).includes(v);
}

export default async function protection(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    protectionSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: error instanceof Error ? error.message : String(error),
      },
      1
    );
    printError(error);
    return 1;
  }

  const actionArg = parsedArgs.args[0];
  const action = isProtectionAction(actionArg) ? actionArg : undefined;

  if (!action && parsedArgs.args.length > 1) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message:
          'Invalid arguments. Usage: `vercel project protection [name]`',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection'
            ),
            when: 'Show deployment protection for the linked project',
          },
        ],
      },
      2
    );
    output.error(
      'Invalid arguments. Usage: `vercel project protection [name]`'
    );
    return 2;
  }
  if (action && parsedArgs.args.length > 2) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Invalid arguments. Usage: \\`vercel project protection ${action} [name]\\``,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `project protection ${action}`
            ),
            when: 'Retry with at most one project name',
          },
        ],
      },
      2
    );
    output.error(
      `Invalid arguments. Usage: \\`vercel project protection ${action} [name]\\``
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: formatResult.error,
      },
      1
    );
    output.error(formatResult.error);
    return 1;
  }

  const preferJson =
    formatResult.jsonOutput || Boolean(client.nonInteractive);

"""

COMMON_FOOTER = """
  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project protection',
      projectNameOrId: action ? parsedArgs.args[1] : parsedArgs.args[0],
      forReadOnlyCommand: !action,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'protection',
    });
    printError(err);
    return 1;
  }

{{ACTION_BLOCK}}

  const raw = project as Project & Record<string, unknown>;
  const slice: Record<string, unknown> = {};
  for (const key of PROTECTION_KEYS) {
    if (key in raw) {
      slice[key] = raw[key];
    }
  }

  if (preferJson) {
    client.stdout.write(
      `${JSON.stringify({ projectId: project.id, name: project.name, ...slice }, null, 2)}\\n`
    );
    return 0;
  }

  output.log(
    `${chalk.bold('Protection settings')} for ${chalk.cyan(project.name)} (${project.id})`
  );
  if (Object.keys(slice).length === 0) {
    output.log('No deployment protection fields returned for this project.');
    return 0;
  }
  for (const [k, v] of Object.entries(slice)) {
    output.log(`${chalk.cyan(`${k}:`)} ${JSON.stringify(v)}`);
  }
  return 0;
}
"""


def build_protection_ts(
    *,
    extra_const: str,
    parse_flags: str,
    validate: str,
    action_block: str,
    types_import: str = "JSONObject, Project",
) -> str:
    header = COMMON_HEADER.replace("{{TYPES_IMPORT}}", types_import)
    return (
        header
        + extra_const
        + PROTECTION_KEYS
        + COMMON_MID
        + parse_flags
        + "\n"
        + validate
        + COMMON_FOOTER.replace("{{ACTION_BLOCK}}", action_block)
    )


VARIANTS: dict[str, dict] = {
    "sso": {
        "branch": "brooke/cli-236-protection-sso",
        "title": "feat(cli): project protection SSO enable/disable",
        "changeset": "cli-project-protection-sso.md",
        "changeset_body": "---\nvercel: minor\n---\n\nAdd `vercel project protection` actions for SSO deployment protection (`--sso`).\n",
        "subcommand": """export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  arguments: [
    { name: 'action', required: false },
    { name: 'name', required: false },
  ],
  options: [
    formatOption,
    {
      name: 'sso',
      shorthand: null,
      type: Boolean,
      description: 'Apply action to SSO protection.',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --format json`,
    },
    {
      name: 'Enable SSO deployment protection',
      value: `${packageName} project protection enable --sso`,
    },
    {
      name: 'Disable SSO for a named project',
      value: `${packageName} project protection disable my-app --sso`,
    },
  ],
} as const;
""",
        "protection_ts": build_protection_ts(
            extra_const="const ENABLED_DEPLOYMENT_TYPE = 'prod_deployment_urls_and_all_previews';\n",
            parse_flags="  const selected = Boolean(parsedArgs.flags['--sso']);",
            validate="""  if (action && !selected) {
    const msg =
      'No protection selected. Pass --sso. Usage: `vercel project protection enable|disable [name] --sso`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with the protection flag (e.g. --sso).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection disable --sso'
            ),
            when: 'Example: disable with SSO protection selected',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }
""",
            action_block="""
  if (action) {
    const patchBody: JSONObject = {
      ssoProtection:
        action === 'enable'
          ? { deploymentType: ENABLED_DEPLOYMENT_TYPE }
          : null,
    };

    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: patchBody,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
      printError(err);
      return 1;
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            ssoProtection: action === 'enable',
          },
          null,
          2
        )}\\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }
""",
        ),
        "test_ts": r'''import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (SSO)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires --sso for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('disables SSO protection when --sso is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ ssoProtection: null });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--sso'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection disabled');
  });

  it('returns JSON for enable with --sso', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--sso',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      ssoProtection: true,
    });
  });
});
''',
    },
    "password": {
        "branch": "brooke/cli-236-protection-password",
        "title": "feat(cli): project protection password enable/disable",
        "changeset": "cli-project-protection-password.md",
        "changeset_body": "---\nvercel: minor\n---\n\nAdd `vercel project protection` actions for password deployment protection (`--password`).\n",
        "subcommand": """export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  arguments: [
    { name: 'action', required: false },
    { name: 'name', required: false },
  ],
  options: [
    formatOption,
    {
      name: 'password',
      shorthand: null,
      type: Boolean,
      description:
        'Apply action to password protection (requires eligible plan/permissions).',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --format json`,
    },
    {
      name: 'Disable password protection',
      value: `${packageName} project protection disable my-app --password`,
    },
    {
      name: 'Enable password protection',
      value: `${packageName} project protection enable my-app --password`,
    },
  ],
} as const;
""",
        "protection_ts": build_protection_ts(
            extra_const="const ENABLED_DEPLOYMENT_TYPE = 'prod_deployment_urls_and_all_previews';\n",
            parse_flags="  const selected = Boolean(parsedArgs.flags['--password']);",
            validate="""  if (action && !selected) {
    const msg =
      'No protection selected. Pass --password. Usage: `vercel project protection enable|disable [name] --password`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with the protection flag (e.g. --password).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection disable --password'
            ),
            when: 'Example: disable with password protection selected',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }
""",
            action_block="""
  if (action) {
    const patchBody: JSONObject = {
      passwordProtection:
        action === 'enable'
          ? { deploymentType: ENABLED_DEPLOYMENT_TYPE }
          : null,
    };

    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: patchBody,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
      printError(err);
      return 1;
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            passwordProtection: action === 'enable',
          },
          null,
          2
        )}\\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }
""",
        ),
        "test_ts": r'''import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (password)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires --password for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('disables password protection when --password is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ passwordProtection: null });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--password'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection disabled');
  });
});
''',
    },
    "skew": {
        "branch": "brooke/cli-236-protection-skew",
        "title": "feat(cli): project protection skew enable/disable",
        "changeset": "cli-project-protection-skew.md",
        "changeset_body": "---\nvercel: minor\n---\n\nAdd `vercel project protection` actions for skew protection via `skewProtectionMaxAge` (`--skew`).\n",
        "subcommand": """export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  arguments: [
    { name: 'action', required: false },
    { name: 'name', required: false },
  ],
  options: [
    formatOption,
    {
      name: 'skew',
      shorthand: null,
      type: Boolean,
      description: 'Apply action to skew protection.',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --format json`,
    },
    {
      name: 'Enable skew protection',
      value: `${packageName} project protection enable my-app --skew`,
    },
    {
      name: 'Disable skew protection',
      value: `${packageName} project protection disable my-app --skew`,
    },
  ],
} as const;
""",
        "protection_ts": build_protection_ts(
            extra_const="const DEFAULT_SKEW_PROTECTION_MAX_AGE = 2592000;\n",
            parse_flags="  const selected = Boolean(parsedArgs.flags['--skew']);",
            validate="""  if (action && !selected) {
    const msg =
      'No protection selected. Pass --skew. Usage: `vercel project protection enable|disable [name] --skew`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with the protection flag (e.g. --skew).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection disable --skew'
            ),
            when: 'Example: disable with skew protection selected',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }
""",
            action_block="""
  if (action) {
    const patchBody: JSONObject = {
      skewProtectionMaxAge:
        action === 'enable' ? DEFAULT_SKEW_PROTECTION_MAX_AGE : 0,
    };

    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: patchBody,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
      printError(err);
      return 1;
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            skewProtection: action === 'enable',
          },
          null,
          2
        )}\\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }
""",
        ),
        "test_ts": r'''import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (skew)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires --skew for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('enables skew protection via skewProtectionMaxAge', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ skewProtectionMaxAge: 2592000 });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--skew'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });
});
''',
    },
    "customer-support": {
        "branch": "brooke/cli-236-protection-customer-support-code",
        "title": "feat(cli): project protection customer support code visibility",
        "changeset": "cli-project-protection-customer-support-code.md",
        "changeset_body": "---\nvercel: minor\n---\n\nAdd `vercel project protection` actions for customer support code visibility (`--customer-support-code-visibility`).\n",
        "subcommand": """export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  arguments: [
    { name: 'action', required: false },
    { name: 'name', required: false },
  ],
  options: [
    formatOption,
    {
      name: 'customer-support-code-visibility',
      shorthand: null,
      type: Boolean,
      description:
        'Apply action to customer support code visibility protection.',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --format json`,
    },
    {
      name: 'Enable customer support code visibility',
      value: `${packageName} project protection enable my-app --customer-support-code-visibility`,
    },
    {
      name: 'Disable customer support code visibility',
      value: `${packageName} project protection disable my-app --customer-support-code-visibility`,
    },
  ],
} as const;
""",
        "protection_ts": build_protection_ts(
            extra_const="",
            parse_flags="  const selected = Boolean(parsedArgs.flags['--customer-support-code-visibility']);",
            validate="""  if (action && !selected) {
    const msg =
      'No protection selected. Pass --customer-support-code-visibility. Usage: `vercel project protection enable|disable [name] --customer-support-code-visibility`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with the protection flag (e.g. --customer-support-code-visibility).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection disable --customer-support-code-visibility'
            ),
            when: 'Example: disable with this protection type selected',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }
""",
            action_block="""
  if (action) {
    const patchBody: JSONObject = {
      customerSupportCodeVisibility: action === 'enable',
    };

    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: patchBody,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
      printError(err);
      return 1;
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            customerSupportCodeVisibility: action === 'enable',
          },
          null,
          2
        )}\\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }
""",
        ),
        "test_ts": r'''import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (customer support code visibility)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires selector for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('sets customerSupportCodeVisibility', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ customerSupportCodeVisibility: true });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--customer-support-code-visibility'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });
});
''',
    },
    "git-fork": {
        "branch": "brooke/cli-236-protection-git-fork",
        "title": "feat(cli): project protection git fork protection",
        "changeset": "cli-project-protection-git-fork.md",
        "changeset_body": "---\nvercel: minor\n---\n\nAdd `vercel project protection` actions for Git fork protection (`--git-fork-protection`).\n",
        "subcommand": """export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  arguments: [
    { name: 'action', required: false },
    { name: 'name', required: false },
  ],
  options: [
    formatOption,
    {
      name: 'git-fork-protection',
      shorthand: null,
      type: Boolean,
      description: 'Apply action to Git fork protection.',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --format json`,
    },
    {
      name: 'Enable Git fork protection',
      value: `${packageName} project protection enable my-app --git-fork-protection`,
    },
    {
      name: 'Disable Git fork protection',
      value: `${packageName} project protection disable my-app --git-fork-protection`,
    },
  ],
} as const;
""",
        "protection_ts": build_protection_ts(
            extra_const="",
            parse_flags="  const selected = Boolean(parsedArgs.flags['--git-fork-protection']);",
            validate="""  if (action && !selected) {
    const msg =
      'No protection selected. Pass --git-fork-protection. Usage: `vercel project protection enable|disable [name] --git-fork-protection`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with the protection flag (e.g. --git-fork-protection).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection disable --git-fork-protection'
            ),
            when: 'Example: disable with Git fork protection selected',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }
""",
            action_block="""
  if (action) {
    const patchBody: JSONObject = {
      gitForkProtection: action === 'enable',
    };

    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: patchBody,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
      printError(err);
      return 1;
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            gitForkProtection: action === 'enable',
          },
          null,
          2
        )}\\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }
""",
        ),
        "test_ts": r'''import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (git fork)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires selector for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('sets gitForkProtection', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ gitForkProtection: false });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--git-fork-protection'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });
});
''',
    },
    "bypass": {
        "branch": "brooke/cli-236-protection-bypass",
        "title": "feat(cli): project protection automation bypass",
        "changeset": "cli-project-protection-bypass.md",
        "changeset_body": "---\nvercel: minor\n---\n\nAdd `vercel project protection` actions for automation protection bypass via PATCH `/v1/projects/.../protection-bypass` (`--protection-bypass`).\n",
        "subcommand": """export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  arguments: [
    { name: 'action', required: false },
    { name: 'name', required: false },
  ],
  options: [
    formatOption,
    {
      name: 'protection-bypass',
      shorthand: null,
      type: Boolean,
      description: 'Apply action to automation protection bypass secrets.',
      deprecated: false,
    },
    {
      name: 'protection-bypass-secret',
      shorthand: null,
      type: String,
      argument: 'SECRET',
      description:
        'Optional secret value for protection bypass. Required when disabling bypass.',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --format json`,
    },
    {
      name: 'Enable automation protection bypass',
      value: `${packageName} project protection enable my-app --protection-bypass`,
    },
    {
      name: 'Disable bypass with secret',
      value: `${packageName} project protection disable my-app --protection-bypass --protection-bypass-secret <secret>`,
    },
  ],
} as const;
""",
        "protection_ts": build_protection_ts(
            extra_const="",
            types_import="Project",
            parse_flags="""  const selected = Boolean(parsedArgs.flags['--protection-bypass']);
  const protectionBypassSecret = parsedArgs.flags[
    '--protection-bypass-secret'
  ] as string | undefined;
""",
            validate="""  if (action && !selected) {
    const msg =
      'No protection selected. Pass --protection-bypass. Usage: `vercel project protection enable|disable [name] --protection-bypass`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with --protection-bypass.',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection enable --protection-bypass'
            ),
            when: 'Example: enable automation protection bypass',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }
""",
            action_block="""
  if (action) {
    if (selected) {
      if (action === 'disable' && !protectionBypassSecret) {
        const secretMsg =
          'Disabling protection bypass requires --protection-bypass-secret <secret>.';
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: secretMsg,
            hint: 'Pass the existing automation bypass secret to revoke it.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'project protection disable --protection-bypass --protection-bypass-secret <secret>'
                ),
                when: 'Replace <secret> with the bypass secret to revoke',
              },
            ],
          },
          2
        );
        output.error(secretMsg);
        return 2;
      }
      try {
        const bypassBody =
          action === 'enable'
            ? {
                generate: protectionBypassSecret
                  ? { secret: protectionBypassSecret }
                  : {},
              }
            : {
                revoke: {
                  secret: protectionBypassSecret,
                  regenerate: false,
                },
              };
        await client.fetch(
          `/v1/projects/${encodeURIComponent(project.id)}/protection-bypass`,
          {
            method: 'PATCH',
            body: bypassBody,
          }
        );
      } catch (err: unknown) {
        exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
        printError(err);
        return 1;
      }
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            protectionBypass: selected ? action === 'enable' : undefined,
          },
          null,
          2
        )}\\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }
""",
        ),
        "test_ts": r'''import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (automation bypass)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires --protection-bypass for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('enables protection bypass via project bypass endpoint', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch(
      '/v1/projects/prj_123/protection-bypass',
      (req, res) => {
        expect(req.body).toEqual({
          generate: {},
        });
        res.json({ protectionBypass: {} });
      }
    );

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--protection-bypass'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
  });

  it('requires bypass secret when disabling protection bypass', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--protection-bypass'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('requires --protection-bypass-secret');
  });
});
''',
    },
}


def main() -> None:
    dry = "--dry-run" in sys.argv
    run(["git", "fetch", "origin", "main"], check=False)
    run(["git", "checkout", "origin/main"], check=True)
    run(["git", "pull", "--ff-only", "origin", "main"], check=False)

    for key, spec in VARIANTS.items():
        branch = spec["branch"]
        print(f"\n=== {branch} ===")
        run(["git", "branch", "-D", branch], check=False)
        run(["git", "checkout", "-b", branch], check=True)

        git_write_patch("index", INDEX_PATCH)
        git_write_patch("telemetry", TELEMETRY_PATCH)
        git_write_patch("agent", AGENT_OUTPUT_PATCH)

        cmd_path = ROOT / "packages/cli/src/commands/project/command.ts"
        text = cmd_path.read_text()
        text = insert_protection_subcommand(text, spec["subcommand"])
        text = insert_subcommands_list(text)
        cmd_path.write_text(text)

        (ROOT / "packages/cli/src/commands/project/protection.ts").write_text(
            spec["protection_ts"]
        )
        (
            ROOT / "packages/cli/test/unit/commands/project/protection.test.ts"
        ).write_text(spec["test_ts"])

        cs = ROOT / ".changeset" / spec["changeset"]
        cs.write_text(spec["changeset_body"])

        paths = [
            ".changeset/" + spec["changeset"],
            "packages/cli/src/commands/project/command.ts",
            "packages/cli/src/commands/project/index.ts",
            "packages/cli/src/commands/project/protection.ts",
            "packages/cli/src/util/agent-output.ts",
            "packages/cli/src/util/telemetry/commands/project/index.ts",
            "packages/cli/test/unit/commands/project/protection.test.ts",
        ]
        run(["git", "add", "--"] + paths)
        run(
            [
                "git",
                "commit",
                "-m",
                spec["title"],
            ]
        )
        if not dry:
            run(["git", "push", "-u", "origin", branch, "--force-with-lease"])
            run(
                [
                    "gh",
                    "pr",
                    "create",
                    "--head",
                    branch,
                    "--base",
                    "main",
                    "--title",
                    spec["title"],
                    "--body",
                    f"Isolated CLI change: **`{key}`** deployment protection only.\n\n"
                    "Merge independently; combine with other `brooke/cli-236-protection-*` PRs for full parity.\n",
                ]
            )
        run(["git", "checkout", "origin/main"])

    print("\nDone.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--emit-protection" and len(sys.argv) > 2:
        sys.stdout.write(VARIANTS[sys.argv[2]]["protection_ts"])
    else:
        main()
