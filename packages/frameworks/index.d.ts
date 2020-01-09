export interface FrameworkDetectionItem {
  file: string;
  matchContent?: string;
}

type Setting = { value: string } | { placeholder: string };

export interface Framework {
  name: string;
  slug: string;
  logo: string;
  demo: string;
  tagline: string;
  website: string;
  description: string;
  detectors?: {
    every?: FrameworkDetectionItem[];
    some?: FrameworkDetectionItem[];
  };
  settings: {
    buildCommand: Setting;
    devCommand: Setting;
    outputDirectory: Setting;
  };
}
