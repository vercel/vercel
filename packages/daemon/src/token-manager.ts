import { readAuthConfig, isValidAccessToken } from '@vercel/oidc/auth-config';
import { logger } from './logger';
import { OAuthRefresher } from './oauth-refresher';
import { OidcRefresher } from './oidc-refresher';
import { discoverTokens } from './discovery';

export interface DaemonStatus {
  status: 'running';
  projects: string[];
  oauth: {
    valid: boolean;
    expiresAt?: number;
  };
}

export class TokenManager {
  private oauthRefresher: OAuthRefresher;
  private oidcRefresher: OidcRefresher;

  constructor() {
    this.oauthRefresher = new OAuthRefresher();
    this.oidcRefresher = new OidcRefresher();
  }

  /**
   * Initialize the token manager and start refresh cycles
   */
  async initialize(): Promise<void> {
    logger.info('Initializing token manager');

    // Start OAuth refresh cycle
    await this.oauthRefresher.start();

    // Discover existing OIDC tokens
    const discovered = discoverTokens();

    logger.info(`Discovered ${discovered.size} OIDC tokens`);

    // Add all discovered projects to OIDC refresher
    for (const [projectId] of discovered.entries()) {
      this.oidcRefresher.addProject(projectId);
    }

    logger.info('Token manager initialized');
  }

  /**
   * Add a project to OIDC token management
   */
  handleAddProject(projectId: string): void {
    logger.info('Adding project to token management', { projectId });
    this.oidcRefresher.addProject(projectId);
  }

  /**
   * Remove a project from OIDC token management
   */
  handleRemoveProject(projectId: string): void {
    logger.info('Removing project from token management', { projectId });
    this.oidcRefresher.removeProject(projectId);
  }

  /**
   * Get current daemon status
   */
  getStatus(): DaemonStatus {
    const authConfig = readAuthConfig();
    const oauthStatus = {
      valid: authConfig ? isValidAccessToken(authConfig) : false,
      expiresAt: authConfig?.expiresAt,
    };

    return {
      status: 'running',
      projects: this.oidcRefresher.getProjects(),
      oauth: oauthStatus,
    };
  }

  /**
   * Force immediate refresh of all tokens (called after user login)
   */
  forceRefresh(): void {
    logger.info('Force refreshing all tokens');
    this.oauthRefresher.forceRefresh();
    this.oidcRefresher.forceRefresh();
  }

  /**
   * Stop all token refresh cycles
   */
  stop(): void {
    logger.info('Stopping token manager');
    this.oauthRefresher.stop();
    this.oidcRefresher.stop();
  }
}
