/**
 * Sandbox provisioning for the connect command
 * Uses the official @vercel/sandbox SDK
 */

import { Sandbox } from '@vercel/sandbox';
import output from '../../output-manager';

// Bridge configuration
const BRIDGE_REPO = 'vercel-eddie/bridge';

export interface ProvisionSandboxOptions {
  teamId: string | undefined;
  projectId: string;
  token: string;
  runtime?: string;
  timeout?: number; // milliseconds
  proxyPort: number; // Port for the bridge proxy (usually 3000)
  sessionName: string;
  bridgeVersion: string; // e.g., 'edge', 'v1.0.0'
}

export interface ProvisionedSandbox {
  sandbox: Sandbox;
  sandboxUrl: string;
}

/**
 * Provision a sandbox with bridge server running
 *
 * This replicates the logic from `bridge create`:
 * 1. Create sandbox via SDK
 * 2. Install bridge binary
 * 3. Start bridge server
 * 4. Return the sandbox URL
 */
export async function provisionSandbox(
  options: ProvisionSandboxOptions
): Promise<ProvisionedSandbox> {
  const {
    teamId,
    projectId,
    token,
    runtime = 'node22',
    timeout = 60 * 60 * 1000, // 1 hour default
    proxyPort,
    sessionName,
    bridgeVersion,
  } = options;

  let sandbox: Sandbox | undefined;

  try {
    // Step 1: Create sandbox using the SDK
    output.spinner('Creating sandbox...', 0);
    sandbox = await Sandbox.create({
      teamId,
      projectId,
      token,
      runtime,
      timeout,
      ports: [proxyPort],
    });
    output.debug(`Sandbox created: ${sandbox.sandboxId}`);

    // Step 2: Install bridge binary
    output.spinner('Installing bridge...', 0);
    await installBridgeBinary(sandbox, bridgeVersion);
    output.debug(`Bridge binary installed (version: ${bridgeVersion})`);

    // Step 3: Start bridge server (detached)
    output.spinner('Starting bridge server...', 0);
    await startBridgeServer(sandbox, proxyPort, sessionName);
    output.debug('Bridge server started');

    // Step 4: Get sandbox URL from domain
    const sandboxUrl = sandbox.domain(proxyPort);

    return {
      sandbox,
      sandboxUrl,
    };
  } catch (error) {
    // Cleanup on failure
    if (sandbox) {
      output.debug(`Cleaning up failed sandbox: ${sandbox.sandboxId}`);
      try {
        await sandbox.stop();
      } catch (cleanupError) {
        output.debug(`Failed to cleanup sandbox: ${cleanupError}`);
      }
    }

    throw error;
  }
}

/**
 * Install bridge binary in the sandbox
 *
 * @param sandbox - The sandbox instance
 * @param version - Version to install (e.g., 'edge', 'v1.0.0')
 */
async function installBridgeBinary(
  sandbox: Sandbox,
  version: string
): Promise<void> {
  // Create directories
  await sandbox.runCommand('mkdir', ['-p', '/vercel/sandbox/.bridge/bin']);

  // Detect architecture and download appropriate binary
  // URL format: https://github.com/vercel-eddie/bridge/releases/download/{version}/bridge-linux-{arch}
  const installCmd = `
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64) ARCH="amd64" ;;
      aarch64) ARCH="arm64" ;;
      *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
    esac
    curl -fsSL "https://github.com/${BRIDGE_REPO}/releases/download/${version}/bridge-linux-\${ARCH}" -o /vercel/sandbox/.bridge/bin/bridge && chmod +x /vercel/sandbox/.bridge/bin/bridge
  `;

  const result = await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', installCmd],
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to install bridge binary (exit code: ${result.exitCode})`
    );
  }
}

/**
 * Start bridge server in the sandbox
 */
async function startBridgeServer(
  sandbox: Sandbox,
  proxyPort: number,
  sessionName: string
): Promise<void> {
  const addr = `:${proxyPort}`;
  const serverCmd = `/vercel/sandbox/.bridge/bin/bridge server --addr ${addr} --name ${sessionName}`;

  // Run detached so it keeps running
  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', `nohup ${serverCmd} > /tmp/bridge-server.log 2>&1 &`],
  });
}
