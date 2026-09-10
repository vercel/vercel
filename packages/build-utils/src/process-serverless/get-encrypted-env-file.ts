import FileBlob from '../file-blob';
import { sha256 } from '../fs/stream-to-digest-async';

/**
 * A type to represent the encrypted environment file that needs to be
 * attached to Lambdas with ENV > 4kb
 */
export type EncryptedEnvFile = [string, FileBlob];

/**
 * Get the encrypted environment file from the environment variables if it
 * exists and it is supported by the runtime.
 */
export function getEncryptedEnv(
  envFilename: string | undefined,
  envContent: string | undefined
): EncryptedEnvFile | undefined {
  if (!envFilename || !envContent) {
    return;
  }

  const data = Buffer.from(envContent, 'base64');
  return [
    envFilename,
    new FileBlob({
      data,
      contentHash: sha256(data),
    }),
  ];
}
