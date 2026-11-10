export type ConnectAuthorizationDetail =
  | ConnectGitHubAppInstallationAuthorizationDetail
  | ConnectCustomAuthorizationDetail;

export interface ConnectCustomAuthorizationDetail {
  type: string;
  [key: string]: unknown;
}

export interface ConnectGitHubAppInstallationAuthorizationDetail {
  type: 'github_app_installation';
  org?: string;
  permissions?: string | string[];
  repositories?: string | string[];
}
