import { detectPlatformConfigs } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectPlatformConfigs', () => {
  it('should return empty configs when no platform files exist', async () => {
    const fs = new VirtualFilesystem({
      'package.json': '{}',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(0);
  });

  it('should detect Heroku Procfile', async () => {
    const fs = new VirtualFilesystem({
      Procfile: 'web: node server.js\nworker: node worker.js',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].platform).toBe('heroku');
    expect(result.configs[0].displayName).toBe('Heroku');
    expect(result.configs[0].files).toHaveLength(1);
    expect(result.configs[0].files[0].filename).toBe('Procfile');
    expect(result.configs[0].files[0].content).toBe(
      'web: node server.js\nworker: node worker.js'
    );
  });

  it('should detect both Heroku files', async () => {
    const fs = new VirtualFilesystem({
      Procfile: 'web: node server.js',
      'app.json': '{"name": "my-app"}',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].files).toHaveLength(2);
    expect(result.configs[0].files.map(f => f.filename)).toEqual([
      'Procfile',
      'app.json',
    ]);
  });

  it('should detect Railway config', async () => {
    const fs = new VirtualFilesystem({
      'railway.toml': '[build]\nbuilder = "nixpacks"',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].platform).toBe('railway');
  });

  it('should detect Render config', async () => {
    const fs = new VirtualFilesystem({
      'render.yaml': 'services:\n  - type: web',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].platform).toBe('render');
  });

  it('should detect Docker files', async () => {
    const fs = new VirtualFilesystem({
      Dockerfile: 'FROM node:18-alpine\nCOPY . .\nCMD ["node", "index.js"]',
      'docker-compose.yml': 'version: "3"\nservices:\n  web:\n    build: .',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].platform).toBe('docker');
    expect(result.configs[0].files).toHaveLength(2);
  });

  it('should detect multiple platforms at once', async () => {
    const fs = new VirtualFilesystem({
      Procfile: 'web: node server.js',
      Dockerfile: 'FROM node:18',
      'render.yaml': 'services:\n  - type: web',
    });
    const result = await detectPlatformConfigs(fs);
    expect(result.configs).toHaveLength(3);
    const platforms = result.configs.map(c => c.platform);
    expect(platforms).toContain('heroku');
    expect(platforms).toContain('docker');
    expect(platforms).toContain('render');
  });
});
