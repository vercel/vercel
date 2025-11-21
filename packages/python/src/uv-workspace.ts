import fs from 'fs';
import os from 'os';
import { join } from 'path';
import { debug, readConfigFile, type Meta } from '@vercel/build-utils';
import { installRequirementsFile } from './install';

// https://docs.astral.sh/uv/concepts/projects/workspaces/#workspace-sources
type UvWorkspaceConfig = {
  tool?: {
    uv?: {
      workspace?: {
        members?: string[];
        exclude?: string[];
      };
      // The shape of each source is much richer, but we only care about the
      // `workspace` flag for now.
      sources?: Record<string, { workspace?: boolean }>;
    };
  };
  project?: {
    name?: string;
    version?: string;
    dependencies?: string[];
  };
};

type AppPyprojectConfig = {
  project?: {
    dependencies?: string[];
  };
};

function getDependencyName(spec: string): string | null {
  // PEP 508 dependency spec starts with the package name, followed by optional
  // version constraints / markers. We only need the leading "name" portion.
  const match = spec.match(/^[A-Za-z0-9_.-]+/);
  return match ? match[0] : null;
}

export async function installUvWorkspaceDependencies({
  repoRootPath,
  pyprojectDir,
  pythonPath,
  pipPath,
  uvPath,
  workPath,
  vendorBaseDir,
  meta,
}: {
  repoRootPath?: string;
  pyprojectDir: string | null;
  pythonPath: string;
  pipPath: string;
  uvPath: string | null;
  workPath: string;
  vendorBaseDir: string;
  meta: Meta;
}) {
  if (!repoRootPath || !pyprojectDir) {
    return;
  }

  // Detect a uv workspace at the repo root so we can include internal
  // workspace projects as proper runtime dependencies.
  let rootPyproject: UvWorkspaceConfig | null = null;
  try {
    rootPyproject = await readConfigFile<UvWorkspaceConfig>(
      join(repoRootPath, 'pyproject.toml')
    );
  } catch (err) {
    debug('Failed to parse workspace root pyproject.toml', err);
  }

  const uvTool = rootPyproject?.tool?.uv;
  const workspaceCfg = uvTool?.workspace;
  const sourcesCfg = uvTool?.sources;

  if (!workspaceCfg || !sourcesCfg) {
    // No uv workspace configured at the repo root.
    return;
  }

  const workspaceSourceNames = new Set(
    Object.entries(sourcesCfg)
      .filter(([, src]) => src && src.workspace)
      .map(([name]) => name)
  );

  if (!workspaceSourceNames.size) {
    return;
  }

  // Read the app's pyproject to see which declared dependencies come
  // from uv workspace sources.
  let appPyproject: AppPyprojectConfig | null = null;
  try {
    appPyproject = await readConfigFile<AppPyprojectConfig>(
      join(pyprojectDir, 'pyproject.toml')
    );
  } catch (err) {
    debug('Failed to parse app pyproject.toml for workspace deps', err);
  }

  const appDeps = appPyproject?.project?.dependencies ?? [];
  const workspaceDepsForApp = new Set<string>();

  for (const spec of appDeps) {
    const name = getDependencyName(spec);
    if (name && workspaceSourceNames.has(name)) {
      workspaceDepsForApp.add(name);
    }
  }

  if (!workspaceDepsForApp.size) {
    return;
  }

  const members = workspaceCfg.members ?? [];
  const nameToDir = new Map<string, string>();

  for (const member of members) {
    const memberDir = join(repoRootPath, member);
    let memberPyproject: UvWorkspaceConfig | null = null;
    try {
      memberPyproject = await readConfigFile<UvWorkspaceConfig>(
        join(memberDir, 'pyproject.toml')
      );
    } catch (err) {
      debug('Failed to parse workspace member pyproject.toml', err);
      continue;
    }
    const projectName = memberPyproject?.project?.name;
    if (projectName) {
      nameToDir.set(projectName, memberDir);
    }
  }

  const requirementLines: string[] = [];

  for (const name of workspaceDepsForApp) {
    const dir = nameToDir.get(name);
    if (!dir) {
      debug(
        `uv workspace dependency "${name}" declared but corresponding member directory not found`
      );
      continue;
    }
    // Use absolute paths so that pip can resolve the local project regardless
    // of the current working directory.
    requirementLines.push(dir);
  }

  if (!requirementLines.length) {
    return;
  }

  const tmpDir = await fs.promises.mkdtemp(
    join(os.tmpdir(), 'vercel-uv-workspace-')
  );
  const reqPath = join(tmpDir, 'requirements.workspace.txt');
  await fs.promises.writeFile(reqPath, requirementLines.join('\n'));

  await installRequirementsFile({
    pythonPath,
    pipPath,
    uvPath,
    filePath: reqPath,
    workPath,
    targetDir: vendorBaseDir,
    meta,
  });
}
