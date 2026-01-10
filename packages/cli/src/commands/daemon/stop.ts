import output from '../../output-manager';
import {
  sendDaemonMessage,
  isDaemonRunning,
} from '../../util/daemon/ipc-client';

export default async function stop(): Promise<number> {
  // Check if daemon is running
  try {
    const isRunning = await isDaemonRunning();
    if (!isRunning) {
      output.error('Daemon is not running');
      return 1;
    }
  } catch (err) {
    output.error('Daemon is not running');
    return 1;
  }

  output.log('Stopping daemon...');

  try {
    // Send shutdown message
    await sendDaemonMessage({ type: 'shutdown' });

    // Give it a moment to shut down
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify it stopped
    const isRunning = await isDaemonRunning();
    if (!isRunning) {
      output.log('Daemon stopped successfully');
      return 0;
    } else {
      output.warn('Daemon may still be running. Check status.');
      return 1;
    }
  } catch (err) {
    // Error sending message might mean it already stopped
    const isRunning = await isDaemonRunning();
    if (!isRunning) {
      output.log('Daemon stopped');
      return 0;
    }

    output.error(
      `Failed to stop daemon: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
