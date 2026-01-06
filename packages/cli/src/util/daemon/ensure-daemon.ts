import { execSync, spawn } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import output from '../../output-manager';
import { isDaemonRunning } from './ipc-client';
import { notifyDaemonForceRefresh } from './notify';

function getUserDataDir(): string | null {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  switch (platform()) {
    case 'darwin':
      return join(homedir(), 'Library/Application Support');
    case 'linux':
      return join(homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}

function isDaemonInstalled(): boolean {
  switch (platform()) {
    case 'darwin': {
      const plistPath = join(
        homedir(),
        'Library/LaunchAgents/com.vercel.daemon.plist'
      );
      return existsSync(plistPath);
    }
    case 'linux': {
      const unitPath = join(
        homedir(),
        '.config/systemd/user/vercel-daemon.service'
      );
      return existsSync(unitPath);
    }
    case 'win32':
      try {
        const result = execSync('schtasks /query /tn VercelTokenDaemon 2>nul', {
          encoding: 'utf8',
        });
        return result.includes('VercelTokenDaemon');
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function installDaemonService(daemonPath: string, logPath: string): boolean {
  try {
    switch (platform()) {
      case 'darwin': {
        const plistPath = join(
          homedir(),
          'Library/LaunchAgents/com.vercel.daemon.plist'
        );

        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vercel.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${daemonPath}</string>
  </array>
  <key>ProcessType</key>
  <string>Background</string>
  <key>Nice</key>
  <integer>0</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VERCEL_DAEMON</key>
    <string>1</string>
  </dict>
</dict>
</plist>`;

        const launchAgentsDir = join(homedir(), 'Library/LaunchAgents');
        if (!existsSync(launchAgentsDir)) {
          mkdirSync(launchAgentsDir, { recursive: true });
        }

        writeFileSync(plistPath, plistContent);
        execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' });
        return true;
      }

      case 'linux': {
        const unitDir = join(homedir(), '.config/systemd/user');
        const unitPath = join(unitDir, 'vercel-daemon.service');

        const unitContent = `[Unit]
Description=Vercel Token Refresh Daemon
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${daemonPath}
Restart=on-failure
RestartSec=10
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;

        if (!existsSync(unitDir)) {
          mkdirSync(unitDir, { recursive: true });
        }

        writeFileSync(unitPath, unitContent);
        execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
        execSync('systemctl --user enable vercel-daemon', { stdio: 'ignore' });
        return true;
      }

      case 'win32': {
        const command = `"${process.execPath}" "${daemonPath}"`;
        execSync(
          `schtasks /create /tn VercelTokenDaemon /tr "${command}" /sc ONLOGON /f`,
          { stdio: 'ignore' }
        );
        return true;
      }

      default:
        return false;
    }
  } catch (err) {
    output.debug(
      `Failed to install daemon service: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

async function startDaemonProcess(daemonPath: string): Promise<boolean> {
  try {
    // Check if already running
    const isRunning = await isDaemonRunning();
    if (isRunning) {
      return true;
    }

    // Start in background
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify it's running
    return await isDaemonRunning();
  } catch (err) {
    output.debug(
      `Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

/**
 * Ensures the daemon is installed and running after login
 * This is fire-and-forget - errors are logged but don't fail the login
 */
export async function ensureDaemonRunning(): Promise<void> {
  try {
    // Find daemon executable (in the same directory as the CLI bundle)
    const daemonPath = join(__dirname, 'vercel-daemon.js');
    if (!existsSync(daemonPath)) {
      output.debug('Daemon executable not found, skipping daemon setup');
      return;
    }

    // Get log path
    const dataDir = getUserDataDir();
    if (!dataDir) {
      output.debug('Unable to determine user data directory');
      return;
    }

    const logDir = join(dataDir, 'com.vercel.cli', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true, mode: 0o770 });
    }
    const logPath = join(logDir, 'daemon.log');

    // Check if daemon service is installed
    const installed = isDaemonInstalled();
    if (!installed) {
      output.debug('Installing daemon service...');
      const success = installDaemonService(daemonPath, logPath);
      if (!success) {
        output.debug('Failed to install daemon service');
        return;
      }
      output.debug('Daemon service installed');
    }

    // Ensure daemon is running
    const running = await startDaemonProcess(daemonPath);
    if (running) {
      output.debug('Daemon is running');
      // Trigger force refresh with new credentials
      await notifyDaemonForceRefresh();
    } else {
      output.debug('Daemon is not running (may start on next login)');
    }
  } catch (err) {
    // Silently fail - daemon is optional
    output.debug(
      `Daemon setup failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
