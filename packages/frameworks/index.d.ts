export interface FrameworkDetectionItem {
  file: string;
  matchContent?: string;
}

interface Setting {
  value?: string;
  placeholder?: string;
}

export interface Framework {
  name: string;
  slug: string;
  logo: string;
  tagline: string;
  website: string;
  detectors?: {
    every?: FrameworkDetectionItem[];
    some?: FrameworkDetectionItem[];
  };
  settings?: {
    buildCommand?: Setting;
    devCommand?: Setting;
    outputDirectory?: Setting;
  };
}
