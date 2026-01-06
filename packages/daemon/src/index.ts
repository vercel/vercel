#!/usr/bin/env node

import { logger } from './logger';
import { PIDManager } from './pid-manager';
import { TokenManager } from './token-manager';
import { IPCServer } from './ipc-server';

/**
 * Vercel Token Refresh Daemon
 *
 * This daemon runs in the background and proactively refreshes:
 * - OAuth tokens (CLI authentication)
 * - OIDC tokens (per-project tokens)
 *
 * It communicates with the CLI via Unix domain sockets for:
 * - Adding/removing projects from management
 * - Status queries
 * - Graceful shutdown
 */

let pidManager: PIDManager | undefined;
let tokenManager: TokenManager | undefined;
let ipcServer: IPCServer | undefined;

async function main() {
  try {
    logger.info('Vercel daemon starting...');

    // Acquire PID file to ensure single instance
    pidManager = new PIDManager();
    const acquired = await pidManager.acquire();

    if (!acquired) {
      logger.error('Another daemon instance is already running');
      process.exit(1);
    }

    logger.info(`Daemon process started with PID ${process.pid}`);

    // Initialize token manager
    tokenManager = new TokenManager();
    await tokenManager.initialize();

    // Start IPC server
    ipcServer = new IPCServer(tokenManager);
    await ipcServer.start();

    logger.info('Daemon started successfully');

    // Set up signal handlers for graceful shutdown
    setupSignalHandlers();
  } catch (err) {
    logger.error('Failed to start daemon', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await cleanup();
    process.exit(1);
  }
}

/**
 * Set up handlers for graceful shutdown on SIGTERM and SIGINT
 */
function setupSignalHandlers() {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await cleanup();
      process.exit(0);
    });
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', async err => {
    logger.error('Uncaught exception, shutting down', {
      error: err.message,
      stack: err.stack,
    });
    await cleanup();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async reason => {
    logger.error('Unhandled promise rejection, shutting down', {
      reason: String(reason),
    });
    await cleanup();
    process.exit(1);
  });
}

/**
 * Clean up resources before exit
 */
async function cleanup() {
  logger.info('Cleaning up daemon resources...');

  try {
    // Stop token manager (clears all timers)
    if (tokenManager) {
      tokenManager.stop();
      tokenManager = undefined;
    }

    // Stop IPC server
    if (ipcServer) {
      await ipcServer.stop();
      ipcServer = undefined;
    }

    // Release PID file
    if (pidManager) {
      await pidManager.release();
      pidManager = undefined;
    }

    logger.info('Daemon shutdown complete');
  } catch (err) {
    logger.error('Error during cleanup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Start the daemon
main();
