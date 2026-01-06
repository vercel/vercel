import { Server, Socket, createServer } from 'net';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { getVercelDataDir } from '@vercel/oidc/token-util';
import { logger } from './logger';
import type { TokenManager } from './token-manager';

export interface IPCMessage {
  type:
    | 'add-project'
    | 'remove-project'
    | 'refresh-now'
    | 'status'
    | 'shutdown'
    | 'force-refresh';
  payload?: {
    projectId?: string;
  };
}

export interface IPCResponse {
  success: boolean;
  error?: string;
  data?: any;
}

export class IPCServer {
  private server: Server;
  private socketPath: string;
  private tokenManager: TokenManager;

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;

    const dataDir = getVercelDataDir();
    if (!dataDir) {
      throw new Error('Unable to determine data directory for IPC socket');
    }

    // getVercelDataDir() already returns .../com.vercel.cli
    this.socketPath = join(dataDir, 'daemon.sock');
    this.server = createServer(socket => this.handleConnection(socket));
  }

  /**
   * Start the IPC server
   */
  async start(): Promise<void> {
    // Clean up stale socket
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
        logger.debug('Removed stale socket file');
      } catch (err) {
        logger.warn('Failed to remove stale socket', err);
      }
    }

    return new Promise((resolve, reject) => {
      this.server.once('error', reject);

      this.server.listen(this.socketPath, () => {
        logger.info(`IPC server listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  /**
   * Stop the IPC server
   */
  async stop(): Promise<void> {
    return new Promise(resolve => {
      this.server.close(() => {
        // Clean up socket file
        if (existsSync(this.socketPath)) {
          try {
            unlinkSync(this.socketPath);
            logger.debug('Cleaned up socket file');
          } catch (err) {
            logger.warn('Failed to clean up socket file', err);
          }
        }
        logger.info('IPC server stopped');
        resolve();
      });
    });
  }

  /**
   * Handle a new client connection
   */
  private handleConnection(socket: Socket): void {
    logger.debug('IPC client connected');

    let buffer = '';

    socket.on('data', chunk => {
      buffer += chunk.toString();

      // Process newline-delimited messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(socket, line);
        }
      }
    });

    socket.on('error', err => {
      logger.error('IPC socket error', err);
    });

    socket.on('end', () => {
      logger.debug('IPC client disconnected');
    });
  }

  /**
   * Handle a single IPC message
   */
  private handleMessage(socket: Socket, data: string): void {
    try {
      const message: IPCMessage = JSON.parse(data);
      logger.debug('Received IPC message', { type: message.type });

      const response = this.processMessage(message);

      // Send response back to client
      socket.write(JSON.stringify(response) + '\n');
    } catch (err) {
      const errorResponse: IPCResponse = {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid message format',
      };
      socket.write(JSON.stringify(errorResponse) + '\n');
    }
  }

  /**
   * Process an IPC message and return a response
   */
  private processMessage(message: IPCMessage): IPCResponse {
    switch (message.type) {
      case 'add-project': {
        const { projectId } = message.payload || {};
        if (!projectId) {
          return {
            success: false,
            error: 'Missing projectId in payload',
          };
        }

        this.tokenManager.handleAddProject(projectId);
        return { success: true };
      }

      case 'remove-project': {
        const { projectId } = message.payload || {};
        if (!projectId) {
          return {
            success: false,
            error: 'Missing projectId in payload',
          };
        }

        this.tokenManager.handleRemoveProject(projectId);
        return { success: true };
      }

      case 'status': {
        const status = this.tokenManager.getStatus();
        return {
          success: true,
          data: status,
        };
      }

      case 'force-refresh': {
        logger.info('Received force-refresh command via IPC');
        this.tokenManager.forceRefresh();
        return { success: true };
      }

      case 'shutdown': {
        logger.info('Received shutdown command via IPC');
        // Schedule shutdown after response is sent
        setImmediate(() => {
          process.kill(process.pid, 'SIGTERM');
        });
        return { success: true };
      }

      case 'refresh-now': {
        // Could implement immediate refresh trigger if needed
        return {
          success: false,
          error: 'refresh-now not yet implemented',
        };
      }

      default:
        return {
          success: false,
          error: `Unknown message type: ${(message as any).type}`,
        };
    }
  }
}
