import { statSync } from 'fs';

interface ValidationOptions {
  maxFileSize?: number;
  allowedExtensions?: string[];
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.csv', '.json'];
const MAX_REDIRECTS = 1_000_000;
const MAX_URL_LENGTH = 2048;
const VALID_STATUS_CODES = [301, 302, 303, 307, 308];

export function validateUploadFile(
  filePath: string,
  options: ValidationOptions = {}
): ValidationResult {
  const maxSize = options.maxFileSize ?? MAX_FILE_SIZE;
  const allowedExts = options.allowedExtensions ?? ALLOWED_EXTENSIONS;

  try {
    const stats = statSync(filePath);

    if (!stats.isFile()) {
      return { valid: false, error: `Path "${filePath}" is not a file` };
    }

    if (stats.size > maxSize) {
      const sizeMB = Math.round(maxSize / (1024 * 1024));
      return { valid: false, error: `File must be below ${sizeMB}MB` };
    }

    const hasValidExtension = allowedExts.some(ext =>
      filePath.toLowerCase().endsWith(ext)
    );
    if (!hasValidExtension) {
      return {
        valid: false,
        error: `File must be a .csv or .json file`,
      };
    }

    return { valid: true };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { valid: false, error: `File "${filePath}" not found` };
    }
    return { valid: false, error: `Error accessing file: ${err.message}` };
  }
}

export function validateRedirect(redirect: {
  source: string;
  destination: string;
  statusCode?: number;
  permanent?: boolean;
}): ValidationResult {
  if (!redirect.source) {
    return { valid: false, error: 'Redirect source is required' };
  }

  if (redirect.source.length > MAX_URL_LENGTH) {
    return { valid: false, error: 'Source URL is too long' };
  }

  if (!redirect.source.startsWith('/')) {
    return { valid: false, error: 'Source must be a relative path' };
  }

  if (!redirect.destination) {
    return { valid: false, error: 'Redirect destination is required' };
  }

  if (redirect.destination.length > MAX_URL_LENGTH) {
    return { valid: false, error: 'Destination URL is too long' };
  }

  try {
    new URL(redirect.destination, 'https://vercel.com');
  } catch {
    return { valid: false, error: 'Destination must be a valid URL' };
  }

  if (redirect.statusCode) {
    if (!VALID_STATUS_CODES.includes(redirect.statusCode)) {
      return {
        valid: false,
        error: `Invalid status code. Must be one of: ${VALID_STATUS_CODES.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

export function validateRedirectsArray(redirects: unknown): ValidationResult {
  if (!Array.isArray(redirects)) {
    return {
      valid: false,
      error: 'JSON file must contain an array of redirects',
    };
  }

  if (redirects.length === 0) {
    return { valid: false, error: 'No redirects provided' };
  }

  if (redirects.length > MAX_REDIRECTS) {
    return {
      valid: false,
      error: `Too many redirects. Maximum allowed: ${MAX_REDIRECTS}`,
    };
  }

  for (let i = 0; i < redirects.length; i++) {
    const result = validateRedirect(redirects[i]);
    if (!result.valid) {
      return {
        valid: false,
        error: `Redirect ${i + 1}: ${result.error}`,
      };
    }
  }

  return { valid: true };
}

export function validateCSVStructure(content: string): ValidationResult {
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    return {
      valid: false,
      error: 'CSV must have a header and at least one redirect',
    };
  }

  const header = lines[0].toLowerCase();
  const hasSource = header.includes('source');
  const hasDestination = header.includes('destination');

  if (!hasSource || !hasDestination) {
    return {
      valid: false,
      error: 'CSV must have "source" and "destination" columns',
    };
  }

  return { valid: true };
}

export function validateVersionName(name: string): ValidationResult {
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }
  if (name.length > 256) {
    return { valid: false, error: 'Name must be 256 characters or less' };
  }
  return { valid: true };
}
