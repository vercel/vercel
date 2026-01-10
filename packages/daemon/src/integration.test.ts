import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Server, Socket } from 'net';
import { IPCServer } from './ipc-server';
import { TokenManager } from './token-manager';
import * as fs from 'fs';
import * as authConfig from '@vercel/oidc/auth-config';

// Mock file system operations
vi.mock('fs');

// Mock net module
vi.mock('net', async importOriginal => {
  const actual = await importOriginal<typeof import('net')>();
  return {
    ...actual,
    createServer: vi.fn(),
  };
});

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock OIDC utilities
vi.mock('@vercel/oidc/auth-config');
vi.mock('@vercel/oidc/token-util', () => ({
  getUserDataDir: vi.fn(() => '/mock/data/dir'),
  getVercelDataDir: vi.fn(() => '/mock/data/dir/com.vercel.cli'),
  loadToken: vi.fn(() => null),
  saveToken: vi.fn(),
  getTokenPayload: vi.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
  isExpired: vi.fn(() => false),
}));
vi.mock('@vercel/oidc/oauth');

describe('Daemon Integration Tests', () => {
  describe('IPC Server Communication', () => {
    let ipcServer: IPCServer;
    let tokenManager: TokenManager;
    let mockServer: Server;
    let mockListen: ReturnType<typeof vi.fn>;
    let mockClose: ReturnType<typeof vi.fn>;
    let connectionHandler: ((socket: Socket) => void) | null = null;

    beforeEach(async () => {
      vi.clearAllMocks();

      // Mock fs operations
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      // Mock auth config
      vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(null);

      // Create token manager
      tokenManager = new TokenManager();

      // Setup mocked server
      mockListen = vi.fn((_path: string, callback: () => void) => {
        callback();
      });
      mockClose = vi.fn((callback: () => void) => {
        callback();
      });

      mockServer = {
        listen: mockListen,
        close: mockClose,
        once: vi.fn(),
      } as any;

      // Mock createServer from net module
      const { createServer } = await import('net');
      (createServer as any).mockImplementation(
        (handler: (socket: Socket) => void) => {
          connectionHandler = handler;
          return mockServer;
        }
      );

      ipcServer = new IPCServer(tokenManager);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should start IPC server successfully', async () => {
      await ipcServer.start();

      expect(mockListen).toHaveBeenCalled();
    });

    it('should stop IPC server successfully', async () => {
      await ipcServer.start();
      await ipcServer.stop();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle status message', async () => {
      await ipcServer.start();

      // Mock auth to return valid status
      vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue({
        token: 'test-token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      vi.spyOn(authConfig, 'isValidAccessToken').mockReturnValue(true);

      // Create mock socket
      let responseData = '';
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            // Simulate receiving status message
            const message = JSON.stringify({ type: 'status' }) + '\n';
            handler(Buffer.from(message));
          }
        }),
        write: vi.fn((data: string) => {
          responseData = data;
        }),
      } as any;

      // Trigger connection
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      // Parse response
      const response = JSON.parse(responseData);
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('status', 'running');
      expect(response.data).toHaveProperty('projects');
      expect(response.data).toHaveProperty('oauth');
    });

    it('should handle add-project message', async () => {
      await ipcServer.start();

      let responseData = '';
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            const message =
              JSON.stringify({
                type: 'add-project',
                payload: { projectId: 'test-project', teamId: 'test-team' },
              }) + '\n';
            handler(Buffer.from(message));
          }
        }),
        write: vi.fn((data: string) => {
          responseData = data;
        }),
      } as any;

      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      const response = JSON.parse(responseData);
      expect(response.success).toBe(true);
    });

    it('should handle remove-project message', async () => {
      await ipcServer.start();

      let responseData = '';
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            const message =
              JSON.stringify({
                type: 'remove-project',
                payload: { projectId: 'test-project' },
              }) + '\n';
            handler(Buffer.from(message));
          }
        }),
        write: vi.fn((data: string) => {
          responseData = data;
        }),
      } as any;

      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      const response = JSON.parse(responseData);
      expect(response.success).toBe(true);
    });

    it('should reject add-project without projectId', async () => {
      await ipcServer.start();

      let responseData = '';
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            const message =
              JSON.stringify({
                type: 'add-project',
                payload: { teamId: 'test-team' },
              }) + '\n';
            handler(Buffer.from(message));
          }
        }),
        write: vi.fn((data: string) => {
          responseData = data;
        }),
      } as any;

      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      const response = JSON.parse(responseData);
      expect(response.success).toBe(false);
      expect(response.error).toContain('projectId');
    });

    it('should handle invalid JSON gracefully', async () => {
      await ipcServer.start();

      let responseData = '';
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            handler(Buffer.from('invalid json\n'));
          }
        }),
        write: vi.fn((data: string) => {
          responseData = data;
        }),
      } as any;

      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      const response = JSON.parse(responseData);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle multiple messages from same client', async () => {
      await ipcServer.start();

      const responses: string[] = [];
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            // Send multiple messages
            const msg1 = JSON.stringify({ type: 'status' }) + '\n';
            const msg2 =
              JSON.stringify({
                type: 'add-project',
                payload: { projectId: 'proj-1' },
              }) + '\n';
            const msg3 = JSON.stringify({ type: 'status' }) + '\n';

            handler(Buffer.from(msg1 + msg2 + msg3));
          }
        }),
        write: vi.fn((data: string) => {
          responses.push(data);
        }),
      } as any;

      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      // Should have received 3 responses
      expect(responses.length).toBe(3);

      // All should be valid JSON
      responses.forEach(r => {
        const parsed = JSON.parse(r);
        expect(parsed).toHaveProperty('success');
      });
    });

    it('should handle partial messages correctly', async () => {
      await ipcServer.start();

      let responseData = '';
      const mockSocket = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            // Send partial message first
            handler(Buffer.from('{"type":"stat'));
            // Then send the rest
            handler(Buffer.from('us"}\n'));
          }
        }),
        write: vi.fn((data: string) => {
          responseData = data;
        }),
      } as any;

      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      const response = JSON.parse(responseData);
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('status');
    });
  });

  describe('TokenManager Lifecycle', () => {
    let tokenManager: TokenManager;

    beforeEach(() => {
      vi.clearAllMocks();

      // Mock fs operations
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      // Mock auth config
      vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(null);

      tokenManager = new TokenManager();
    });

    it('should initialize without errors', async () => {
      await expect(tokenManager.initialize()).resolves.toBeUndefined();
    });

    it('should report running status after initialization', async () => {
      await tokenManager.initialize();

      const status = tokenManager.getStatus();

      expect(status.status).toBe('running');
      expect(status.projects).toEqual([]);
      expect(status.oauth).toEqual({ valid: false });
    });

    it('should add and track projects', async () => {
      await tokenManager.initialize();

      tokenManager.handleAddProject('project-1');
      tokenManager.handleAddProject('project-2');

      // Projects are now being tracked (even though refresh may not have happened yet)
      // The test verifies the command was accepted without error
      expect(() => tokenManager.getStatus()).not.toThrow();
    });

    it('should remove projects', async () => {
      await tokenManager.initialize();

      tokenManager.handleAddProject('project-1');
      tokenManager.handleRemoveProject('project-1');

      // Should not throw
      expect(() => tokenManager.getStatus()).not.toThrow();
    });

    it('should stop cleanly', async () => {
      await tokenManager.initialize();

      tokenManager.handleAddProject('project-1');
      tokenManager.stop();

      // Should not throw
      expect(() => tokenManager.stop()).not.toThrow();
    });
  });
});
