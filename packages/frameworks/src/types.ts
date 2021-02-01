import { Route } from '@vercel/routing-utils';

export interface FrameworkDetectionItem {
  path: string;
  matchContent?: string;
}

export interface SettingPlaceholder {
  placeholder: string;
}

export interface SettingValue {
  value: string;
}

export type Setting = SettingValue | SettingPlaceholder;

export interface Framework {
  name: string;
  slug: string | null;
  logo: string;
  demo?: string;
  tagline?: string;
  website?: string;
  description: string;
  sort?: number;
  useRuntime?: { src: string; use: string };
  ignoreRuntimes?: string[];
  detectors?: {
    every?: FrameworkDetectionItem[];
    some?: FrameworkDetectionItem[];
  };
  settings: {
    installCommand: Setting;
    buildCommand: Setting;
    devCommand: Setting;
    outputDirectory: Setting;
  };
  recommendedIntegrations?: {
    id: string;
    dependencies: string[];
  }[];

  dependency?: string;
  getOutputDirName: (dirPrefix: string) => Promise<string>;
  defaultRoutes?: Route[] | ((dirPrefix: string) => Promise<Route[]>);
  cachePattern?: string;
  buildCommand: string | null;
  devCommand: string | null;
}
