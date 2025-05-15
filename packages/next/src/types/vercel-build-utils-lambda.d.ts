declare module '@vercel/build-utils/dist/lambda' {
  import { Files } from '@vercel/build-utils';

  export interface LambdaOptionsWithFiles {
    files: Files;
    handler: string;
    runtime: string;
    memory?: number;
    maxDuration?: number;
    environment?: { [key: string]: string };
    regions?: string[];
    supportsMultiPayloads?: boolean;
    supportsWrapper?: boolean;
    experimentalResponseStreaming?: boolean;
  }
}
