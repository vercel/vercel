import { connect } from 'net';
import { join } from 'path';
import getGlobalPathConfig from '../config/global-path';

export interface IPCMessage {
  type:
    | 'add-project'
    | 'remove-project'
    | 'refresh-now'
    | 'status'
    | 'shutdown';
  payload?: {
    projectId?: string;
    teamId?: string;
  };
}

export interface IPCResponse {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Send a message to the daemon via IPC
 * Returns the daemon's response or throws an error
 */
export async function sendDaemonMessage(
  message: IPCMessage
): Promise<IPCResponse> {
  return new Promise((resolve, reject) => {
    const globalPath = getGlobalPathConfig();
    const socketPath = join(globalPath, 'daemon.sock');

    const socket = connect(socketPath);

    // Set a timeout for the connection
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('IPC connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      // Send the message
      socket.write(JSON.stringify(message) + '\n');
    });

    socket.on('data', data => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString()) as IPCResponse;
        socket.end();
        resolve(response);
      } catch (err) {
        socket.end();
        reject(new Error('Failed to parse daemon response'));
      }
    });

    socket.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Check if the daemon is currently running
 */
export async function isDaemonRunning(): Promise<boolean> {
  try {
    const response = await sendDaemonMessage({ type: 'status' });
    return response.success;
  } catch {
    return false;
  }
}
