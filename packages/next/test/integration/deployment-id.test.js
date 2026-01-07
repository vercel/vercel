process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const fs = require('fs-extra');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

describe('deploymentId in build output', () => {
  it('should include deploymentId when .next/deployment-id.txt exists', async () => {
    const workPath = await fs.mkdtemp(
      path.join(__dirname, 'deployment-id-test-')
    );

    try {
      // Create a minimal Next.js project structure
      const pagesDir = path.join(workPath, 'pages');
      await fs.mkdirp(pagesDir);
      await fs.writeFile(
        path.join(pagesDir, 'index.js'),
        `export default function Home() { return <div>Hello</div>; }`
      );

      await fs.writeFile(
        path.join(workPath, 'package.json'),
        JSON.stringify({
          name: 'test',
          version: '1.0.0',
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
            'react-dom': '^18.0.0',
          },
        })
      );

      // Create .next directory and deployment-id.txt
      const nextDir = path.join(workPath, '.next');
      await fs.mkdirp(nextDir);
      await fs.writeFile(
        path.join(nextDir, 'deployment-id.txt'),
        'test-deployment-123'
      );

      // Create BUILD_ID file (required for server build)
      await fs.writeFile(path.join(nextDir, 'BUILD_ID'), 'test-build-id');

      // Create a minimal routes-manifest.json
      await fs.mkdirp(path.join(nextDir, 'server'));
      await fs.writeFile(
        path.join(nextDir, 'routes-manifest.json'),
        JSON.stringify({
          version: 3,
          pages404: false,
          redirects: [],
          rewrites: [],
          headers: [],
          staticRoutes: [],
          dynamicRoutes: [],
        })
      );

      const { buildResult } = await runBuildLambda(workPath, {
        config: {
          outputDirectory: '.next',
        },
      });

      expect(buildResult.deploymentId).toBe('test-deployment-123');
    } finally {
      await fs.remove(workPath);
    }
  });

  it('should not include deploymentId when .next/deployment-id.txt does not exist', async () => {
    const workPath = await fs.mkdtemp(
      path.join(__dirname, 'deployment-id-test-')
    );

    try {
      // Create a minimal Next.js project structure
      const pagesDir = path.join(workPath, 'pages');
      await fs.mkdirp(pagesDir);
      await fs.writeFile(
        path.join(pagesDir, 'index.js'),
        `export default function Home() { return <div>Hello</div>; }`
      );

      await fs.writeFile(
        path.join(workPath, 'package.json'),
        JSON.stringify({
          name: 'test',
          version: '1.0.0',
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
            'react-dom': '^18.0.0',
          },
        })
      );

      // Create .next directory but NOT deployment-id.txt
      const nextDir = path.join(workPath, '.next');
      await fs.mkdirp(nextDir);

      // Create BUILD_ID file (required for server build)
      await fs.writeFile(path.join(nextDir, 'BUILD_ID'), 'test-build-id');

      // Create a minimal routes-manifest.json
      await fs.mkdirp(path.join(nextDir, 'server'));
      await fs.writeFile(
        path.join(nextDir, 'routes-manifest.json'),
        JSON.stringify({
          version: 3,
          pages404: false,
          redirects: [],
          rewrites: [],
          headers: [],
          staticRoutes: [],
          dynamicRoutes: [],
        })
      );

      const { buildResult } = await runBuildLambda(workPath, {
        config: {
          outputDirectory: '.next',
        },
      });

      expect(buildResult.deploymentId).toBeUndefined();
    } finally {
      await fs.remove(workPath);
    }
  });

  it('should handle empty deployment-id.txt file', async () => {
    const workPath = await fs.mkdtemp(
      path.join(__dirname, 'deployment-id-test-')
    );

    try {
      // Create a minimal Next.js project structure
      const pagesDir = path.join(workPath, 'pages');
      await fs.mkdirp(pagesDir);
      await fs.writeFile(
        path.join(pagesDir, 'index.js'),
        `export default function Home() { return <div>Hello</div>; }`
      );

      await fs.writeFile(
        path.join(workPath, 'package.json'),
        JSON.stringify({
          name: 'test',
          version: '1.0.0',
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
            'react-dom': '^18.0.0',
          },
        })
      );

      // Create .next directory with empty deployment-id.txt
      const nextDir = path.join(workPath, '.next');
      await fs.mkdirp(nextDir);
      await fs.writeFile(path.join(nextDir, 'deployment-id.txt'), '');

      // Create BUILD_ID file (required for server build)
      await fs.writeFile(path.join(nextDir, 'BUILD_ID'), 'test-build-id');

      // Create a minimal routes-manifest.json
      await fs.mkdirp(path.join(nextDir, 'server'));
      await fs.writeFile(
        path.join(nextDir, 'routes-manifest.json'),
        JSON.stringify({
          version: 3,
          pages404: false,
          redirects: [],
          rewrites: [],
          headers: [],
          staticRoutes: [],
          dynamicRoutes: [],
        })
      );

      const { buildResult } = await runBuildLambda(workPath, {
        config: {
          outputDirectory: '.next',
        },
      });

      expect(buildResult.deploymentId).toBeUndefined();
    } finally {
      await fs.remove(workPath);
    }
  });
});
