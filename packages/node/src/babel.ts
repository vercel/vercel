const babel = require('@babel/core'); // eslint-disable-line @typescript-eslint/no-var-requires
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pluginTransformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const { basename } = require('path');

// Security limits for Babel compilation
const MAX_SOURCE_SIZE = 1024 * 1024; // 1MB max source size
const COMPILATION_TIMEOUT = 30000; // 30 second timeout

// Validate and sanitize filename to prevent path traversal attacks
function validateFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid filename provided');
  }
  
  // Check for path traversal attempts before using basename
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename provided');
  }
  
  // Only use basename to prevent path traversal
  const safeName = basename(filename);
  
  // Validate filename pattern (alphanumeric, dots, hyphens, underscores)
  if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    throw new Error('Filename contains invalid characters');
  }
  
  // Prevent extremely long filenames
  if (safeName.length > 255) {
    throw new Error('Filename too long');
  }
  
  return safeName;
}

// Validate and sanitize source code
function validateSource(source: string): string {
  if (typeof source !== 'string') {
    throw new Error('Source must be a string');
  }
  
  // Check source size limit
  if (source.length > MAX_SOURCE_SIZE) {
    throw new Error(`Source code exceeds maximum size of ${MAX_SOURCE_SIZE} bytes`);
  }
  
  // Basic content validation - detect potentially malicious patterns
  const suspiciousPatterns = [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /setTimeout\s*\(/gi,
    /setInterval\s*\(/gi,
    /__proto__/gi,
    /constructor\s*\.\s*constructor/gi,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(source)) {
      throw new Error('Source code contains potentially unsafe patterns');
    }
  }
  
  return source;
}

export function compile(
  filename: string,
  source: string
): { code: string; map: any } {
  try {
    // Validate and sanitize inputs
    const safeFilename = validateFilename(filename);
    const safeSource = validateSource(source);
    
    // Set up timeout for compilation
    const startTime = Date.now();
    
    const result = babel.transform(safeSource, {
      filename: safeFilename,
      configFile: false,
      babelrc: false,
      highlightCode: false,
      compact: false,
      sourceType: 'module',
      sourceMaps: true,
      parserOpts: {
        plugins: [
          'asyncGenerators',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'optionalCatchBinding',
          'objectRestSpread',
          'numericSeparator',
          'dynamicImport',
          'importMeta',
        ],
      },
      plugins: [pluginTransformModulesCommonJs],
    });
    
    // Check if compilation took too long
    const compilationTime = Date.now() - startTime;
    if (compilationTime > COMPILATION_TIMEOUT) {
      throw new Error('Compilation timeout exceeded');
    }
    
    if (!result || !result.code) {
      throw new Error('Babel compilation produced no output');
    }
    
    return result;
  } catch (error) {
    // Sanitize error messages to prevent information disclosure
    const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error';
    
    // Filter out potentially sensitive information from error messages
    const sanitizedMessage = errorMessage
      .replace(/\/[^\s]+/g, '[PATH_REDACTED]') // Remove absolute paths
      .replace(/[A-Za-z]:[^\s]+/g, '[PATH_REDACTED]') // Remove Windows paths
      .replace(/line \d+/gi, '[LINE_REDACTED]') // Remove line numbers (case insensitive)
      .replace(/column \d+/gi, '[COLUMN_REDACTED]') // Remove column numbers (case insensitive)
      .replace(/\(\d+:\d+\)/g, '([LINE_REDACTED]:[COLUMN_REDACTED])'); // Remove (line:col) format
    
    throw new Error(`Babel compilation failed: ${sanitizedMessage}`);
  }
}
