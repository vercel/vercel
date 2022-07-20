import { AuthConfig, GlobalConfig } from '../../types';

export const defaultGlobalConfig: GlobalConfig = {
  _: 'This is your Vercel config file. For more information see the global configuration documentation: https://vercel.com/docs/configuration#global',
  collectMetrics: true,
};

export const defaultAuthConfig: AuthConfig = {
  _: 'This is your Vercel credentials file. DO NOT SHARE! More: https://vercel.com/docs/configuration#global',
};
