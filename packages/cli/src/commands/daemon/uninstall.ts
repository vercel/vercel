import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { existsSync, unlinkSync } from 'fs';
import output from '../../output-manager';

function uninstallMacOS(): void {
  const plistPath = join(
    homedir(),
    'Library/LaunchAgents/com.vercel.daemon.plist'
  );

  if (!existsSync(plistPath)) {
    output.warn('Service configuration not found (already uninstalled?)');
    return;
  }

  // Try to unload the service (ignore errors if not loaded)
  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: 'inherit' });
  } catch (err) {
    // Service might not be loaded, that's okay
  }

  // Remove plist file
  try {
    unlinkSync(plistPath);
    output.log('Removed launchd configuration');
  } catch (err) {
    output.error(
      `Failed to remove configuration: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

function uninstallLinux(): void {
  const unitPath = join(
    homedir(),
    '.config/systemd/user/vercel-daemon.service'
  );

  if (!existsSync(unitPath)) {
    output.warn('Service configuration not found (already uninstalled?)');
    return;
  }

  try {
    // Try to stop and disable the service (ignore errors if not running)
    try {
      execSync('systemctl --user stop vercel-daemon', { stdio: 'inherit' });
    } catch (err) {
      // Service might not be running, that's okay
    }

    try {
      execSync('systemctl --user disable vercel-daemon', { stdio: 'inherit' });
    } catch (err) {
      // Service might not be enabled, that's okay
    }

    // Remove unit file
    unlinkSync(unitPath);
    output.log('Removed systemd unit');

    // Reload systemd
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
  } catch (err) {
    output.error(
      `Failed to remove configuration: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

function uninstallWindows(): void {
  const taskName = 'VercelTokenDaemon';

  try {
    spawnSync('schtasks', ['/delete', '/tn', taskName, '/f'], {
      stdio: 'inherit',
    });
    output.log('Removed scheduled task');
  } catch (err) {
    output.error('Failed to remove Windows scheduled task');
    throw err;
  }
}

export default async function uninstall(): Promise<number> {
  output.log('Uninstalling daemon service...');

  try {
    switch (platform()) {
      case 'darwin':
        uninstallMacOS();
        break;
      case 'linux':
        uninstallLinux();
        break;
      case 'win32':
        uninstallWindows();
        break;
      default:
        output.error(`Unsupported platform: ${platform()}`);
        return 1;
    }

    output.log('Daemon service uninstalled successfully');
    return 0;
  } catch (err) {
    output.error(
      `Failed to uninstall daemon: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
