import { access, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { frameworkList } from '@vercel/frameworks';
import {
  detectFrameworks,
  detectServices,
  getWorkspaces,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';
import output from '../../output-manager';
import { createDetectEntrypoint } from '../../util/projects/detect-entrypoint';
import { prepareServicesConfigWrite } from '../../util/projects/detect-services';
import {
  detectMigrationSignals,
  formatMigrationSignals,
  unresolvedByProposedConfig,
  type MigrationSignal,
} from './migration-signals';

/**
 * Deployment intelligence the CLI can compute deterministically before the
 * agent starts.
 *
 * Everything here is advisory: the detectors are deliberately conservative and
 * incomplete — that is why an agent drives the mission at all — but whatever
 * they do find is fact, and every fact injected into the prompt is a discovery
 * round trip the agent does not spend. Measured against a real session, the
 * agent reconstructed exactly these facts by hand (file tree, workspace
 * manager, framework per directory, which compose/proxy files exist) before it
 * could plan anything.
 *
 * This module is the seam for future static analysis. As the CLI's detectors
 * grow — more layouts, more intent-file formats, entrypoint inference — wire
 * them in here and the mission gets faster and more accurate without touching
 * the instructions.
 */
export interface ProjectIntelligence {
  /** Workspace managers found (`pnpm`, `yarn`, `npm`, `nx`, `rush`). */
  workspaceManagers: string[];
  /** Frameworks detected per directory, `.` meaning the workspace root. */
  frameworks: DetectedFrameworks[];
  /** Services resolved from `vercel.json` or inferred from the layout. */
  services: DetectedService[];
  /** Where the services came from, when any were found. */
  servicesSource?: string;
  /**
   * The exact config file the CLI would write for the inferred services —
   * validated, merged with any existing config, rewrites included. Present
   * only when services were inferred (not already configured) and nothing
   * blocks the write. This is the agent's starting point: writing it verbatim
   * replaces deriving the `services` block by hand.
   */
  proposedConfig?: { fileName: string; content: string };
  /** Deployment-intent files present, relative to the workspace. */
  intentFiles: string[];
  /**
   * Runtime semantics read from the intent files and sources — shared
   * volumes, resident workers, proxy routes, runtime SQLite — the facts a
   * migration plan must account for. See `migration-signals.ts`.
   */
  migrationSignals: MigrationSignal[];
}

export interface DetectedFrameworks {
  path: string;
  frameworks: string[];
}

export interface DetectedService {
  name: string;
  root?: string;
  framework?: string;
  runtime?: string;
  mountPath?: string;
  entrypoint?: string;
}

/**
 * Directories that cannot contain a deployable service of their own and are
 * expensive to stat through.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  '__pycache__',
]);

/** Upper bound on directories probed, so a huge flat repo stays cheap. */
const MAX_SCAN_DIRS = 24;

/**
 * Files that encode how the application is meant to run. The mission calls
 * these "the highest-value files in the repo"; naming the ones that exist
 * saves the agent a tree walk.
 */
const INTENT_FILES = [
  'vercel.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yaml',
  'compose.yml',
  'Dockerfile',
  'Containerfile',
  'fly.toml',
  'render.yaml',
  'railway.json',
  'railway.toml',
  'Procfile',
  'nginx.conf',
  'default.conf',
  'Caddyfile',
  'traefik.yml',
  '.env.example',
  '.env.sample',
  'Makefile',
];

/**
 * Run every deterministic detector the CLI has against the workspace. Each
 * detector is independent and best-effort: a failure in one is logged and
 * costs only its own facts.
 */
export async function collectProjectIntelligence(
  cwd: string
): Promise<ProjectIntelligence> {
  const intelligence: ProjectIntelligence = {
    workspaceManagers: [],
    frameworks: [],
    services: [],
    intentFiles: [],
    migrationSignals: [],
  };

  const fs = new LocalFileSystemDetector(cwd);
  const dirs = await listScanDirs(cwd);

  await Promise.all([
    (async () => {
      try {
        const workspaces = await getWorkspaces({ fs });
        intelligence.workspaceManagers = [
          ...new Set(workspaces.map(workspace => workspace.type)),
        ];
      } catch (error) {
        debug('workspace detection', error);
      }
    })(),

    (async () => {
      try {
        const detected = await Promise.all(
          dirs.map(async dir => {
            const scoped = dir === '.' ? fs : fs.chdir(dir);
            const frameworks = await detectFrameworks({
              fs: scoped,
              frameworkList,
            });
            return {
              path: dir,
              frameworks: frameworks.map(framework => framework.name),
            };
          })
        );
        intelligence.frameworks = detected.filter(
          entry => entry.frameworks.length > 0
        );
      } catch (error) {
        debug('framework detection', error);
      }
    })(),

    (async () => {
      try {
        const result = await detectServices({
          fs,
          // Without the entrypoint callback, Python and Node backends detect
          // as frameworks but never resolve to services — which is exactly
          // the project shape this analysis exists for.
          detectEntrypoint: createDetectEntrypoint(cwd),
        });
        if (result.services.length > 0) {
          intelligence.servicesSource = result.source;
          intelligence.services = result.services.map(service => ({
            name: service.name,
            root: 'root' in service ? service.root : service.workspace,
            framework: service.framework,
            runtime: service.runtime,
            entrypoint: service.entrypoint,
            mountPath:
              'routePrefix' in service ? service.routePrefix : undefined,
          }));
        }

        // Inferred (not yet configured) services can be rendered into the
        // exact vercel.json the CLI itself would write. Best-effort: a
        // blocked write (existing `builds`/`functions` config) or a failed
        // validation simply leaves the agent to write the config itself.
        if (result.inferred && Object.keys(result.inferred.config).length > 0) {
          try {
            const prepared = await prepareServicesConfigWrite(
              cwd,
              result.inferred.config
            );
            intelligence.proposedConfig = {
              fileName: basename(prepared.configPath),
              content: prepared.content,
            };
          } catch (error) {
            debug('proposed config rendering', error);
          }
        }
      } catch (error) {
        debug('service detection', error);
      }
    })(),

    (async () => {
      try {
        const checks = dirs.flatMap(dir =>
          INTENT_FILES.map(async file => {
            const relative = dir === '.' ? file : join(dir, file);
            try {
              await access(join(cwd, relative));
              return relative;
            } catch {
              return undefined;
            }
          })
        );
        intelligence.intentFiles = (await Promise.all(checks)).filter(
          (file): file is string => file !== undefined
        );
      } catch (error) {
        debug('intent file scan', error);
      }
    })(),
  ]);

  // After the parallel detectors: reads the intent files they found, so the
  // compose/proxy/Procfile analysis never rescans the tree for them.
  try {
    intelligence.migrationSignals = await detectMigrationSignals(cwd, {
      dirs,
      intentFiles: intelligence.intentFiles,
    });
  } catch (error) {
    debug('migration signal detection', error);
  }

  return intelligence;
}

/**
 * Render the intelligence as the prose block substituted into the mission, or
 * `undefined` when nothing at all was detected — an empty claim of analysis
 * would only invite the agent to trust a blank.
 */
export function formatProjectIntelligence(
  intelligence: ProjectIntelligence
): string | undefined {
  const facts: string[] = [];

  if (intelligence.workspaceManagers.length > 0) {
    facts.push(
      `  - Workspace manager: ${intelligence.workspaceManagers.join(', ')}`
    );
  }

  if (intelligence.frameworks.length > 0) {
    const rendered = intelligence.frameworks
      .map(entry => {
        const where = entry.path === '.' ? 'workspace root' : `${entry.path}/`;
        return `${where} → ${entry.frameworks.join(' + ')}`;
      })
      .join('; ');
    facts.push(`  - Frameworks: ${rendered}`);
  }

  if (intelligence.intentFiles.length > 0) {
    facts.push(
      `  - Deployment-intent files present: ${intelligence.intentFiles.join(', ')}`
    );
  }

  const signalsBlock = formatMigrationSignals(intelligence.migrationSignals);
  if (signalsBlock) {
    facts.push(signalsBlock);
  }

  if (facts.length === 0) {
    return undefined;
  }

  if (intelligence.services.length > 0) {
    const rendered = intelligence.services
      .map(service => {
        const detail = [
          service.root ? `root ${service.root}` : undefined,
          service.framework,
          service.runtime,
          service.entrypoint ? `entrypoint ${service.entrypoint}` : undefined,
          service.mountPath ? `mounted at ${service.mountPath}` : undefined,
        ]
          .filter(Boolean)
          .join(', ');
        return detail ? `${service.name} (${detail})` : service.name;
      })
      .join('; ');
    facts.push(
      `  - Services (source: ${intelligence.servicesSource}): ${rendered}`
    );
  } else {
    facts.push(
      '  - Services: none configured or inferred — expect to write the `services` block in `vercel.json` yourself.'
    );
  }

  const lines = [
    '- Static analysis of this workspace, pre-computed by the CLI. These findings',
    '  are facts — start from them instead of re-deriving them. They are not',
    '  complete (detection reads manifests, not routing or code), so add what they',
    '  could not see:',
    ...facts,
  ];

  if (intelligence.proposedConfig) {
    lines.push(
      `- The CLI has already computed a validated \`${intelligence.proposedConfig.fileName}\` for this`,
      '  layout — services, entrypoints, and correctly ordered rewrites, merged with',
      '  any existing config. Treat it as the Phase 2 draft and the Phase 4 starting',
      '  point: write it verbatim unless the approved plan disagrees, then run',
      '  `vercel build` once. Do not derive this file from scratch.',
      '',
      '```json',
      intelligence.proposedConfig.content.trimEnd(),
      '```'
    );

    // The config covers request routing and nothing else; saying which
    // signals it leaves open is what keeps "config written" from being
    // mistaken for "migration planned".
    const unresolved = unresolvedByProposedConfig(
      intelligence.migrationSignals
    );
    if (unresolved.length > 0) {
      lines.push(
        '- This proposed config addresses request routing only. It does NOT',
        '  resolve these migration signals — the plan must handle each',
        '  separately:',
        ...unresolved.map(
          signal => `    - ${signal.evidence} (${signal.source})`
        )
      );
    }
    if (
      intelligence.migrationSignals.some(
        signal => signal.kind === 'reverse-proxy-route'
      )
    ) {
      lines.push(
        '- Compare the proxy routes above against the rewrites in the proposed',
        '  config: every proxied route must have an equivalent before the old',
        '  proxy is retired.'
      );
    }
  }

  return lines.join('\n');
}

/**
 * The workspace root plus its first-level directories. Framework and intent
 * detection run per directory, which is what catches the services a JS-centric
 * workspace file omits (a `pyproject.toml` API next to a pnpm workspace, say).
 */
async function listScanDirs(cwd: string): Promise<string[]> {
  const dirs = ['.'];
  try {
    const entries = await readdir(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      dirs.push(entry.name);
      if (dirs.length >= MAX_SCAN_DIRS) break;
    }
  } catch {
    // Unreadable workspace — scan the root only.
  }
  return dirs;
}

function debug(what: string, error: unknown): void {
  output.debug(
    `onboard intelligence: ${what} failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}
