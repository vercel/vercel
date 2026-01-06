import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import {
  loadToken,
  getTokenPayload,
  getUserDataDir,
} from '@vercel/oidc/token-util';
import { logger } from './logger';

export interface DiscoveredToken {
  projectId: string;
  expiresAt: number;
  teamId?: string;
}

/**
 * Discover existing OIDC tokens in the data directory
 * Returns a map of projectId -> token info
 */
export function discoverTokens(): Map<string, DiscoveredToken> {
  const discovered = new Map<string, DiscoveredToken>();

  try {
    const dataDir = getUserDataDir();
    if (!dataDir) {
      logger.warn('Unable to determine data directory for token discovery');
      return discovered;
    }

    const tokenDir = join(dataDir, 'com.vercel.token');

    if (!existsSync(tokenDir)) {
      logger.debug('Token directory does not exist, no tokens to discover');
      return discovered;
    }

    logger.info('Scanning for existing OIDC tokens', { tokenDir });

    const files = readdirSync(tokenDir);
    let validCount = 0;
    let invalidCount = 0;

    for (const file of files) {
      // Only process .json files
      if (!file.endsWith('.json')) {
        continue;
      }

      // Extract project ID from filename
      const projectId = basename(file, '.json');

      try {
        // Load and validate token file
        const tokenResponse = loadToken(projectId);

        if (!tokenResponse) {
          logger.warn(`Failed to load token for ${projectId}, skipping`);
          invalidCount++;
          continue;
        }

        // Parse JWT to get expiration
        const payload = getTokenPayload(tokenResponse.token);

        const discoveredToken: DiscoveredToken = {
          projectId,
          expiresAt: payload.exp * 1000, // Convert to milliseconds
        };

        // Include teamId if present in token file
        if (tokenResponse.teamId) {
          discoveredToken.teamId = tokenResponse.teamId;
        }

        discovered.set(projectId, discoveredToken);

        validCount++;
        logger.debug(`Discovered OIDC token for ${projectId}`, {
          expiresAt: new Date(payload.exp * 1000).toISOString(),
        });
      } catch (err) {
        logger.warn(`Failed to parse token for ${projectId}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        invalidCount++;
      }
    }

    logger.info('Token discovery complete', {
      valid: validCount,
      invalid: invalidCount,
      total: files.length,
    });
  } catch (err) {
    logger.error('Error during token discovery', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return discovered;
}
