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
    buildCommand: Setting;
    devCommand: Setting;
    outputDirectory: Setting;
  };
  recommendedIntegrations?: {
    id: string;
    dependencies: string[];
  }[];
}
