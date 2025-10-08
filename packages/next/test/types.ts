import { BuildResultV2Typical } from '@vercel/build-utils/dist';
import type { BuildResult } from '../src/index';

export interface Context {
  buildResult?: BuildResult | BuildResultV2Typical;
  basePath?: string;
  i18n?: {
    locales: string[];
    defaultLocale: string;
  };
}

export interface LoggerServer {
  url: string;
  close: () => Promise<void>;
  content: Dictionary[];
}

export type Dictionary<T = any> = { [key: string]: T };
