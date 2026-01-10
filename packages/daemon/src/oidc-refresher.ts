import { saveToken, getTokenPayload, loadToken } from '@vercel/oidc/token-util';
import { readAuthConfig, isValidAccessToken } from '@vercel/oidc/auth-config';
import { logger } from './logger';
import { RetryStrategy } from './retry';

interface ProjectState {
  timer?: NodeJS.Timeout;
  retryStrategy: RetryStrategy;
}

interface VercelTokenResponse {
  token: string;
}

export class OidcRefresher {
  private projects = new Map<string, ProjectState>();

  /**
   * Add a project to be managed by the refresher
   */
  addProject(projectId: string): void {
    logger.info(`Adding OIDC project to refresh cycle`, { projectId });

    // Clear existing timer if present
    this.removeProject(projectId);

    // Create new project state with infinite retries
    const state: ProjectState = {
      retryStrategy: new RetryStrategy(Infinity),
    };

    this.projects.set(projectId, state);

    // Trigger immediate refresh check
    this.refreshToken(projectId).catch(err => {
      logger.error(`Failed to refresh OIDC token for ${projectId}`, err);
    });
  }

  /**
   * Remove a project from management
   */
  removeProject(projectId: string): void {
    const state = this.projects.get(projectId);
    if (state) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      this.projects.delete(projectId);
      logger.info(`Removed OIDC project from refresh cycle`, { projectId });
    }
  }

  /**
   * Stop all token refresh cycles
   */
  stop(): void {
    for (const [, state] of this.projects.entries()) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
    }
    this.projects.clear();
    logger.info('Stopped all OIDC token refresh cycles');
  }

  /**
   * Refresh OIDC token for a specific project
   */
  private async refreshToken(projectId: string): Promise<void> {
    const state = this.projects.get(projectId);
    if (!state) {
      logger.warn(`Project ${projectId} not found in refresh state`);
      return;
    }

    try {
      // Get CLI auth token
      const authConfig = readAuthConfig();
      if (!authConfig || !isValidAccessToken(authConfig)) {
        logger.warn(
          `No valid CLI auth token for OIDC refresh of ${projectId}, will retry`
        );
        this.scheduleRetry(projectId);
        return;
      }

      const cliToken = authConfig.token;
      if (!cliToken) {
        logger.warn(`CLI token is undefined for ${projectId}`);
        this.scheduleRetry(projectId);
        return;
      }

      // Load existing token to extract teamId from JWT
      const existingToken = loadToken(projectId);
      let teamId: string | undefined;

      if (existingToken) {
        try {
          const payload = getTokenPayload(existingToken.token);
          // Prefer stable owner_id over owner slug
          teamId = payload.owner_id || payload.owner;
          if (teamId) {
            logger.debug(
              `Extracted teamId from existing token for ${projectId}`,
              {
                teamId,
              }
            );
          }
        } catch (err) {
          logger.warn(
            `Failed to extract teamId from existing token for ${projectId}`,
            { error: err }
          );
        }
      }

      // Build API URL
      const teamParam = teamId ? `&teamId=${teamId}` : '';
      const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-daemon-refresh${teamParam}`;

      logger.debug(`Fetching OIDC token for ${projectId}`, { url });

      // Make API request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cliToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error(`OIDC token refresh failed for ${projectId}`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        this.scheduleRetry(projectId);
        return;
      }

      // Parse and validate response
      const tokenResponse = (await response.json()) as VercelTokenResponse;
      if (!tokenResponse || typeof tokenResponse.token !== 'string') {
        logger.error(`Invalid OIDC token response for ${projectId}`, {
          response: tokenResponse,
        });
        this.scheduleRetry(projectId);
        return;
      }

      // Save token to disk
      saveToken(tokenResponse, projectId);
      logger.info(`OIDC token refreshed successfully for ${projectId}`);

      // Reset retry strategy and schedule next refresh
      state.retryStrategy.reset();
      this.scheduleNext(projectId, tokenResponse.token);
    } catch (err) {
      logger.error(`Unexpected error refreshing OIDC token for ${projectId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      this.scheduleRetry(projectId);
    }
  }

  /**
   * Schedule next refresh based on JWT expiration
   */
  private scheduleNext(projectId: string, token: string): void {
    const state = this.projects.get(projectId);
    if (!state) return;

    try {
      const payload = getTokenPayload(token);

      // Refresh 15 minutes before expiry
      const refreshTime = payload.exp * 1000 - 15 * 60 * 1000;
      const delay = Math.max(0, refreshTime - Date.now());

      logger.debug(`Scheduling next OIDC refresh for ${projectId}`, {
        delayMs: delay,
        refreshAt: new Date(Date.now() + delay).toISOString(),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      });

      state.timer = setTimeout(() => {
        this.refreshToken(projectId).catch(err => {
          logger.error(`Failed to refresh OIDC token for ${projectId}`, err);
        });
      }, delay);
    } catch (err) {
      logger.error(`Failed to parse JWT for ${projectId}, will retry`, err);
      this.scheduleRetry(projectId);
    }
  }

  /**
   * Schedule retry with exponential backoff
   */
  private scheduleRetry(projectId: string): void {
    const state = this.projects.get(projectId);
    if (!state) return;

    // With infinite retries, we never give up
    const delay = state.retryStrategy.getNextDelay();
    logger.debug(`Scheduling OIDC refresh retry for ${projectId}`, {
      attempt: state.retryStrategy.getAttempts(),
      delayMs: delay,
    });

    state.timer = setTimeout(() => {
      this.refreshToken(projectId).catch(err => {
        logger.error(`Failed to refresh OIDC token for ${projectId}`, err);
      });
    }, delay);
  }

  /**
   * Get list of managed project IDs
   */
  getProjects(): string[] {
    return Array.from(this.projects.keys());
  }

  /**
   * Force immediate refresh of all OIDC tokens (useful after login)
   */
  forceRefresh(): void {
    logger.info(`Force refreshing ${this.projects.size} OIDC tokens`);

    for (const [projectId, state] of this.projects.entries()) {
      // Cancel any pending retry
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = undefined;
      }
      // Reset retry strategy to start fresh
      state.retryStrategy.reset();
      // Trigger immediate refresh
      this.refreshToken(projectId).catch(err => {
        logger.error(`Force refresh failed for ${projectId}`, err);
      });
    }
  }
}
