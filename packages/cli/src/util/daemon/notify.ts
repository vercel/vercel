import { sendDaemonMessage } from './ipc-client';
import output from '../../output-manager';

/**
 * Notify the daemon that a project has been linked
 * This is a fire-and-forget operation - errors are logged but not thrown
 */
export async function notifyDaemonProjectLinked(
  projectId: string,
  teamId?: string
): Promise<void> {
  try {
    const response = await sendDaemonMessage({
      type: 'add-project',
      payload: { projectId, teamId },
    });

    if (response.success) {
      output.debug(`Notified daemon about project link: ${projectId}`);
    } else {
      output.debug(
        `Daemon rejected project link notification: ${response.error}`
      );
    }
  } catch (err) {
    // Daemon might not be running - this is okay, just log it
    output.debug(`Failed to notify daemon (daemon may not be running): ${err}`);
  }
}

/**
 * Notify the daemon that a project has been unlinked
 * This is a fire-and-forget operation - errors are logged but not thrown
 */
export async function notifyDaemonProjectUnlinked(
  projectId: string
): Promise<void> {
  try {
    const response = await sendDaemonMessage({
      type: 'remove-project',
      payload: { projectId },
    });

    if (response.success) {
      output.debug(`Notified daemon about project unlink: ${projectId}`);
    } else {
      output.debug(
        `Daemon rejected project unlink notification: ${response.error}`
      );
    }
  } catch (err) {
    // Daemon might not be running - this is okay, just log it
    output.debug(`Failed to notify daemon (daemon may not be running): ${err}`);
  }
}

/**
 * Notify the daemon to force refresh all tokens (called after user login)
 * This is a fire-and-forget operation - errors are logged but not thrown
 */
export async function notifyDaemonForceRefresh(): Promise<void> {
  try {
    const response = await sendDaemonMessage({
      type: 'force-refresh',
    });

    if (response.success) {
      output.debug('Notified daemon to force refresh tokens');
    } else {
      output.debug(`Daemon rejected force refresh: ${response.error}`);
    }
  } catch (err) {
    // Daemon might not be running - this is okay, just log it
    output.debug(`Failed to notify daemon (daemon may not be running): ${err}`);
  }
}
