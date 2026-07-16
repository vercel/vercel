import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REFERENCES_DIR,
  checkArtifacts,
  extractDocumentedCommands,
  extractOptionModels,
  renderFullArtifacts,
  renderIndexArtifacts,
} from '../../scripts/generate-skill-reference';
import type { CommandModel } from '../../scripts/generate-skill-reference';

function allModels(models: CommandModel[]): CommandModel[] {
  return models.flatMap(model => [model, ...allModels(model.subcommands)]);
}

describe('skill reference generator', () => {
  it('documents the public command registry and nothing env-dependent', () => {
    const models = extractDocumentedCommands();
    const names = models.map(model => model.name);

    // Well-known commands must be present.
    expect(names).toContain('deploy');
    expect(names).toContain('env');
    expect(names).toContain('logs');

    // The synthetic `help` stub and the FF_GUIDANCE_MODE-gated `guidance`
    // command must never be documented, regardless of environment.
    expect(names).not.toContain('help');
    expect(names).not.toContain('guidance');

    // Output must be deterministic: sorted at every level.
    for (const model of allModels(models)) {
      const subNames = model.subcommands.map(subcommand => subcommand.name);
      expect(subNames).toEqual([...subNames].sort());
    }
  });

  it('omits deprecated and undocumented options, like --help does', () => {
    const extracted = extractOptionModels([
      {
        name: 'documented',
        shorthand: 'd',
        type: Boolean,
        deprecated: false,
        description: 'A documented option',
      },
      {
        name: 'old',
        shorthand: null,
        type: Boolean,
        deprecated: true,
        description: 'A deprecated option',
      },
      {
        name: 'internal',
        shorthand: null,
        type: [String],
        deprecated: false,
      },
    ]);
    expect(extracted).toEqual([
      {
        name: 'documented',
        shorthand: 'd',
        argument: undefined,
        type: 'boolean',
        repeatable: false,
        description: 'A documented option',
      },
    ]);

    for (const model of allModels(extractDocumentedCommands())) {
      for (const option of model.options) {
        expect(option.description).toBeTruthy();
      }
    }
  });

  it('renders the command index', () => {
    const { 'command-index.md': index } = renderIndexArtifacts();
    expect(index).toContain('## `vercel deploy`');
    expect(index).toContain('## `vercel env`');
    // No flag documentation belongs in the index; detail is delegated.
    expect(index).toContain('--help');
    expect(index.endsWith('\n')).toBe(true);
  });

  it('renders the full per-command reference', () => {
    const files = renderFullArtifacts();
    expect(Object.keys(files)).toContain('commands/README.md');
    expect(Object.keys(files)).toContain('commands/global-options.md');
    expect(Object.keys(files)).toContain('commands/deploy.md');
    expect(files['commands/deploy.md']).toContain('# vercel deploy');
  });

  // Drift gate: once generated artifacts are committed under
  // skills/vercel-cli/references/, any command-spec change must be
  // accompanied by regeneration. Regenerate with:
  //   pnpm --filter vercel generate-skill-reference
  it('committed command index matches the generator output', () => {
    const artifacts = renderIndexArtifacts();
    if (!existsSync(join(REFERENCES_DIR, 'command-index.md'))) {
      return; // variant not committed
    }
    const { missing, outdated, stale } = checkArtifacts(
      artifacts,
      REFERENCES_DIR
    );
    expect(
      { missing, outdated, stale },
      'command index drifted from the command specs; regenerate with: pnpm --filter vercel generate-skill-reference'
    ).toEqual({ missing: [], outdated: [], stale: [] });
  });

  it('committed full reference matches the generator output', () => {
    if (!existsSync(join(REFERENCES_DIR, 'commands'))) {
      return; // variant not committed
    }
    const artifacts = renderFullArtifacts();
    const { missing, outdated, stale } = checkArtifacts(
      artifacts,
      REFERENCES_DIR
    );
    expect(
      { missing, outdated, stale },
      'full command reference drifted from the command specs; regenerate with: pnpm --filter vercel generate-skill-reference'
    ).toEqual({ missing: [], outdated: [], stale: [] });
  });
});
