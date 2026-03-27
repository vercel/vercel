import type { DetectorFilesystem } from './detectors/filesystem';

export type PlatformId = 'heroku' | 'railway' | 'render' | 'docker';

export interface PlatformConfigFile {
  /** Filename that was found (e.g. "Procfile", "Dockerfile") */
  filename: string;
  /** Raw file contents as a string */
  content: string;
}

export interface DetectedPlatformConfig {
  platform: PlatformId;
  /** Display name (e.g. "Heroku", "Railway") */
  displayName: string;
  /** All config files found for this platform */
  files: PlatformConfigFile[];
}

export interface DetectPlatformConfigsResult {
  configs: DetectedPlatformConfig[];
}

interface PlatformDefinition {
  platform: PlatformId;
  displayName: string;
  filenames: string[];
}

const PLATFORM_DEFINITIONS: PlatformDefinition[] = [
  {
    platform: 'heroku',
    displayName: 'Heroku',
    filenames: ['Procfile', 'app.json'],
  },
  {
    platform: 'railway',
    displayName: 'Railway',
    filenames: ['railway.toml'],
  },
  {
    platform: 'render',
    displayName: 'Render',
    filenames: ['render.yaml'],
  },
  {
    platform: 'docker',
    displayName: 'Docker',
    filenames: ['Dockerfile', 'docker-compose.yml'],
  },
];

/**
 * Detect configuration files from popular cloud platforms and Docker.
 *
 * Checks for well-known config files (Procfile, railway.toml, render.yaml,
 * Dockerfile, docker-compose.yml, etc.) and reads their content.
 *
 * Returns only platforms that have at least one config file present.
 */
export async function detectPlatformConfigs(
  fs: DetectorFilesystem
): Promise<DetectPlatformConfigsResult> {
  const configs: DetectedPlatformConfig[] = [];

  for (const def of PLATFORM_DEFINITIONS) {
    const files: PlatformConfigFile[] = [];

    for (const filename of def.filenames) {
      try {
        const exists = await fs.hasPath(filename);
        if (!exists) continue;

        const isFile = await fs.isFile(filename);
        if (!isFile) continue;

        const buf = await fs.readFile(filename);
        files.push({ filename, content: buf.toString('utf8') });
      } catch {}
    }

    if (files.length > 0) {
      configs.push({
        platform: def.platform,
        displayName: def.displayName,
        files,
      });
    }
  }

  return { configs };
}
