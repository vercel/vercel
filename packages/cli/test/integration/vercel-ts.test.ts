import path from 'path';
import fs from 'fs-extra';
import { execCli } from '../helpers/exec';
import { getNewTmpDir } from '../helpers/get-tmp-dir';

const binaryPath = path.resolve(__dirname, '../../scripts/start.js');

describe('vercel.ts support', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = getNewTmpDir();
    process.env.VERCEL_TS_CONFIG_ENABLED = '1';
  });

  afterEach(async () => {
    delete process.env.VERCEL_TS_CONFIG_ENABLED;
    await fs.remove(tmpDir);
  });

  it('should load configuration from vercel.ts during build', async () => {
    const vercelTsPath = path.join(tmpDir, 'vercel.ts');
    const vercelTsContent = `
      export default {
        headers: [
          {
            source: '/(.*)',
            headers: [
              {
                key: 'X-Vercel-TS',
                value: 'true'
              }
            ]
          }
        ]
      };
    `;

    await fs.writeFile(vercelTsPath, vercelTsContent);
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');

    // Mock .vercel/project.json
    await fs.ensureDir(path.join(tmpDir, '.vercel'));
    await fs.writeFile(
      path.join(tmpDir, '.vercel/project.json'),
      JSON.stringify({
        projectId: 'prj_test',
        orgId: 'org_test',
        settings: {},
      })
    );

    const { exitCode } = await execCli(binaryPath, ['build'], {
      cwd: tmpDir,
    });

    expect(exitCode).toBe(0);

    // Verify the compiled config was used by checking the output
    const configPath = path.join(tmpDir, '.vercel/output/config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = await fs.readJSON(configPath);
    const hasHeader = config.routes?.some((r: any) => {
      if (
        r.headers &&
        typeof r.headers === 'object' &&
        !Array.isArray(r.headers)
      ) {
        return r.headers['X-Vercel-TS'] === 'true';
      }
      if (r.headers && Array.isArray(r.headers)) {
        return r.headers.some(
          (h: any) => h.key === 'X-Vercel-TS' && h.value === 'true'
        );
      }
      return false;
    });
    expect(hasHeader).toBe(true);
  });
});
