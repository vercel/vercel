import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';

export const defaultGlobalConfig: GlobalConfig = {
  '// Note':
    'This is your Vercel config file. For more information see the global configuration documentation.',
  '// Docs':
    'https://vercel.com/docs/projects/project-configuration/global-configuration#config.json',
};

export const defaultAuthConfig: AuthConfig = {
  '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
  '// Docs':
    'https://vercel.com/docs/projects/project-configuration/global-configuration#auth.json',
};
