import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface Step {
  id?: string;
  name: string;
  env?: Record<string, string>;
  run?: string;
  with?: Record<string, string>;
}

interface MatrixEntry {
  runner: string;
  platform: string;
  arch: string;
  'native-package': string;
}

const workflowSource = readFileSync(
  new URL(
    '../../../../../.github/workflows/test-native-npm-release.yml',
    import.meta.url
  ),
  'utf8'
);
const workflow = load(workflowSource) as {
  on: Record<string, unknown>;
  jobs: {
    test: {
      strategy: {
        'fail-fast': boolean;
        matrix: { include: MatrixEntry[] };
      };
      steps: Step[];
    };
  };
};
const testJob = workflow.jobs.test;
const steps = testJob.steps;
const harnessSource = readFileSync(
  new URL('../../../scripts/test-native-npm-release.mjs', import.meta.url),
  'utf8'
);

describe('native npm release workflow', () => {
  it('runs manually on all native machine targets', () => {
    expect(workflowSource).toContain('workflow_dispatch:');
    expect(workflowSource).not.toContain('package-manager-cache');
    expect(testJob.strategy['fail-fast']).toBe(false);
    expect(testJob.strategy.matrix.include).toEqual([
      {
        runner: 'macos-15-xlarge',
        platform: 'darwin',
        arch: 'arm64',
        'native-package': '@vercel/vc-native-darwin-arm64',
      },
      {
        runner: 'macos-15-large',
        platform: 'darwin',
        arch: 'x64',
        'native-package': '@vercel/vc-native-darwin-x64',
      },
      {
        runner: 'ubuntu-latest-32-core-arm',
        platform: 'linux',
        arch: 'arm64',
        'native-package': '@vercel/vc-native-linux-arm64',
      },
      {
        runner: 'ubuntu-latest-32-core',
        platform: 'linux',
        arch: 'x64',
        'native-package': '@vercel/vc-native-linux-x64',
      },
    ]);
  });

  it('checks out the selected dispatch ref', () => {
    const checkout = steps.find(step => step.name === 'Checkout selected ref')!;
    expect(checkout.with?.ref).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      '${{ github.sha }}'
    );
  });

  it('passes matching auth secrets only through the acceptance step environment', () => {
    const acceptance = steps.find(
      step => step.name === 'Validate native npm release'
    )!;
    expect(acceptance.env?.VERCEL_TOKEN).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      '${{ secrets.VERCEL_TOKEN }}'
    );
    expect(acceptance.env?.VERCEL_TEAM_ID).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      '${{ secrets.VERCEL_TEAM_ID }}'
    );
    expect(acceptance.run).not.toContain('--token');
    expect(harnessSource).toContain(
      "displayArgs: ['whoami', '--scope', '***']"
    );

    for (const step of steps.filter(step => step !== acceptance)) {
      expect(step.env?.VERCEL_TOKEN).toBeUndefined();
      expect(step.env?.VERCEL_TEAM_ID).toBeUndefined();
    }
  });

  it('can be called from Release with only the secrets it needs', () => {
    const call = workflow.on.workflow_call as {
      inputs: Record<string, { required: boolean; type: string }>;
      secrets: Record<string, { required: boolean }>;
    };
    expect(call.inputs.version).toMatchObject({
      required: true,
      type: 'string',
    });
    expect(Object.keys(call.secrets).sort()).toEqual([
      'VERCEL_TEAM_ID',
      'VERCEL_TOKEN',
    ]);
  });

  it('installs the vercel candidate and runs its native dependency through the launcher', () => {
    const wait = steps.find(
      step => step.name === 'Wait for npm to serve the native package'
    )!;
    expect(wait.run).toContain(
      'node utils/wait-for-npm-packages.mjs --package "vercel@$VERSION" --package "$NATIVE_PACKAGE@$VERSION"'
    );
    const install = steps.find(
      step => step.name === 'Install native CLI from npm'
    )!;
    expect(install.run).toContain(
      'npm install --global --prefix "$PREFIX" "vercel@$VERSION"'
    );
    expect(install.run).not.toContain('"$NATIVE_PACKAGE@$VERSION"');
    expect(steps.indexOf(wait)).toBeLessThan(steps.indexOf(install));

    expect(harnessSource).toContain(
      "const cliRoot = await findInstalledPackage(prefix, 'vercel');"
    );
    expect(harnessSource).toContain(
      'return run(process.execPath, [cliEntrypoint, ...args], {'
    );
    expect(harnessSource).toContain("version.stderr.includes('(native)')");
    expect(harnessSource).toContain('XDG_DATA_HOME: xdgDataHome');
    expect(harnessSource).not.toContain('VERCEL_CLI_USE_NATIVE_BINARY');
    expect(harnessSource).not.toContain("'--enable-binary'");
    expect(workflowSource).not.toContain('VERCEL_CLI_USE_NATIVE_BINARY:');
  });

  it('preinstalls every Builder into its own cache', () => {
    expect(harnessSource).toContain("runCli(['builders', 'preinstall']");
    expect(harnessSource).toContain(
      'env: { ...cliEnv, VERCEL_BUILDERS_DIR: preinstallBuildersDir }'
    );
    expect(harnessSource).toContain('/Preinstalled (\\d+) Builders/');
    expect(
      harnessSource.indexOf('await verifyBuildersPreinstall()')
    ).toBeLessThan(harnessSource.indexOf('await verifyBuilderCache()'));
  });

  it('sets up the toolchains needed by cross-runtime services', () => {
    expect(steps.some(step => step.name === 'Setup Go')).toBe(true);
    expect(steps.some(step => step.name === 'Setup Python')).toBe(true);
    expect(steps.some(step => step.name === 'Install uv')).toBe(true);
  });

  it('runs shared smoke coverage and cold/warm Builder cache checks', () => {
    expect(harnessSource).toContain('smokeTestBinary({');
    expect(harnessSource).toContain('prefixArgs: [cliEntrypoint],');
    expect(harnessSource).toContain(
      "join(installPrefix, 'lib', 'node_modules', ...packageParts)"
    );
    expect(harnessSource).toContain(
      "join(installPrefix, 'node_modules', ...packageParts)"
    );
    expect(harnessSource).toContain("assertSucceeded(cold, 'cold vc build')");
    expect(harnessSource).toContain("assertSucceeded(warm, 'warm vc build')");
    expect(harnessSource).toContain(
      'JSON.stringify(warmSnapshot) !== JSON.stringify(coldSnapshot)'
    );
    expect(harnessSource).toContain("entry.name.includes('.VLT.DELETE.')");
    expect(harnessSource).toContain('if (isENOENT(error)) return');
  });

  it('builds and develops TypeScript-configured cross-runtime services', () => {
    expect(harnessSource).toContain('verifyServicesBuildAndDev()');
    expect(harnessSource).toContain("'@vercel/next'");
    expect(harnessSource).toContain("'@vercel/python'");
    expect(harnessSource).toContain("'@vercel/go'");
    expect(harnessSource).toContain(
      "buildCommand: 'node record-node.mjs && node node_modules/next/dist/bin/next build'"
    );
    expect(harnessSource).toContain("request('/api/python/health')");
    expect(harnessSource).toContain("request('/api/go/health')");
    expect(harnessSource).toContain(
      'const child = spawn(process.execPath, [cliEntrypoint, ...args]'
    );
    expect(harnessSource).toContain('toolchain go1.23.12');
  });
});
