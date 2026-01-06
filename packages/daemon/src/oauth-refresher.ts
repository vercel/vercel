import {
  readAuthConfig,
  writeAuthConfig,
  isValidAccessToken,
  type AuthConfig,
} from '@vercel/oidc/auth-config';
import { refreshTokenRequest, processTokenResponse } from '@vercel/oidc/oauth';
import { logger } from './logger';
import { RetryStrategy } from './retry';

export class OAuthRefresher {
  private timer?: NodeJS.Timeout;
  // Never give up on OAuth refresh - keep trying indefinitely
  private retryStrategy = new RetryStrategy(Infinity);

  /**
   * Start the OAuth token refresh cycle
   */
  async start(): Promise<void> {
    logger.info('Starting OAuth token refresh cycle');
    await this.refreshIfNeeded();
  }

  /**
   * Stop the OAuth token refresh cycle
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    logger.info('Stopped OAuth token refresh cycle');
  }

  /**
   * Force an immediate refresh attempt (useful after login)
   */
  forceRefresh(): void {
    logger.info('Force refreshing OAuth token');
    // Cancel any pending retry
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    // Reset retry strategy to start fresh
    this.retryStrategy.reset();
    // Trigger immediate refresh
    this.refreshIfNeeded().catch(err => {
      logger.error('Force refresh failed', err);
    });
  }

  /**
   * Check if token needs refresh and refresh if necessary
   */
  private async refreshIfNeeded(): Promise<void> {
    try {
      const authConfig = readAuthConfig();

      // No auth config - user not logged in
      if (!authConfig) {
        logger.debug('No auth config found, skipping OAuth refresh');
        this.scheduleRetry();
        return;
      }

      // Token is still valid
      if (isValidAccessToken(authConfig)) {
        logger.debug('OAuth token is still valid');
        this.retryStrategy.reset();
        this.scheduleNext(authConfig);
        return;
      }

      // No refresh token available
      if (!authConfig.refreshToken) {
        logger.warn('No refresh token available, cannot refresh OAuth token');
        this.scheduleRetry();
        return;
      }

      // Perform token refresh
      logger.info('Refreshing OAuth token');
      const tokenResponse = await refreshTokenRequest({
        refresh_token: authConfig.refreshToken,
      });

      const [error, tokens] = await processTokenResponse(tokenResponse);

      if (error || !tokens) {
        logger.error('OAuth token refresh failed', { error: error?.message });
        this.scheduleRetry();
        return;
      }

      // Calculate new expiration
      const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

      // Update auth config with new tokens
      const newAuthConfig: AuthConfig = {
        token: tokens.access_token,
        expiresAt,
        refreshToken: tokens.refresh_token || authConfig.refreshToken,
      };

      writeAuthConfig(newAuthConfig);
      logger.info('OAuth token refreshed successfully', {
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      });

      // Reset retry strategy and schedule next refresh
      this.retryStrategy.reset();
      this.scheduleNext(newAuthConfig);
    } catch (err) {
      logger.error('Unexpected error during OAuth refresh', err);
      this.scheduleRetry();
    }
  }

  /**
   * Schedule the next refresh based on token expiration
   */
  private scheduleNext(authConfig: AuthConfig): void {
    if (!authConfig.expiresAt) {
      logger.warn('No expiresAt in auth config, cannot schedule next refresh');
      return;
    }

    // Refresh 15 minutes before expiry
    const refreshTime = authConfig.expiresAt * 1000 - 15 * 60 * 1000;
    const delay = Math.max(0, refreshTime - Date.now());

    logger.debug('Scheduling next OAuth refresh', {
      delayMs: delay,
      refreshAt: new Date(Date.now() + delay).toISOString(),
    });

    this.timer = setTimeout(() => this.refreshIfNeeded(), delay);
  }

  /**
   * Schedule retry with exponential backoff
   */
  private scheduleRetry(): void {
    if (!this.retryStrategy.shouldRetry()) {
      logger.error(
        'Max OAuth refresh retry attempts reached, stopping refresh cycle'
      );
      return;
    }

    const delay = this.retryStrategy.getNextDelay();
    logger.debug('Scheduling OAuth refresh retry', {
      attempt: this.retryStrategy.getAttempts(),
      delayMs: delay,
    });

    this.timer = setTimeout(() => this.refreshIfNeeded(), delay);
  }
}
