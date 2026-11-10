import Ajv from 'ajv';
import { packageManifestSchema } from '@vercel/build-utils';

const ajv = new Ajv();
const validate = ajv.compile(packageManifestSchema);

/**
 * Validate a parsed `package-manifest.json` object.
 * Returns `null` on success or an error message string on failure.
 */
export function validatePackageManifest(data: unknown): string | null {
  if (validate(data)) {
    return null;
  }
  const errors = validate.errors ?? [];
  return errors.map(e => `${e.dataPath || '(root)'} ${e.message}`).join('; ');
}
