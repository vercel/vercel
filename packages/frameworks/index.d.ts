export interface FrameworkDetectionItem {
  file: string;
  matchContent?: string;
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
    [key: string]: {
      value?: string;
      placeholder?: string;
    };
  };
}
