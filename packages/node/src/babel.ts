const babel = require('@babel/core'); // eslint-disable-line @typescript-eslint/no-var-requires
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pluginTransformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

// Security limits for Babel compilation
const MAX_SOURCE_SIZE = 5 * 1024 * 1024; // 5MB max source size (reasonable for large files)

// Validate filename to prevent path traversal attacks while allowing legitimate paths
function validateFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }
  
  // Prevent path traversal attacks while allowing legitimate relative paths
  if (filename.split(/[\/\\]/).includes('..')) {
    throw new Error('Filename cannot contain path traversal sequences');
  }
  
  // Prevent null bytes which can cause security issues
  if (filename.includes('\0')) {
    throw new Error('Filename cannot contain null bytes');
  }
  
  // Prevent extremely long paths (DoS prevention)
  if (filename.length > 1000) {
    throw new Error('Filename path is too long');
  }
  
  return filename;
}

// Validate source code for basic security and size limits
function validateSource(source: string): string {
  if (typeof source !== 'string') {
    throw new Error('Source code must be a string');
  }
  
  // Prevent extremely large source files (DoS prevention)
  if (source.length > MAX_SOURCE_SIZE) {
    throw new Error(`Source code exceeds maximum size of ${MAX_SOURCE_SIZE} bytes`);
  }
  
  return source;
}

export function compile(
  filename: string,
  source: string
): { code: string; map: any } {
  try {
    // Validate inputs for basic security
    const validatedFilename = validateFilename(filename);
    const validatedSource = validateSource(source);
    
    // Perform Babel transformation with security-conscious configuration
    const result = babel.transform(validatedSource, {
      filename: validatedFilename,
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
    
    if (!result || !result.code) {
      throw new Error('Babel compilation produced no output');
    }
    
    return result;
  } catch (error) {
    // Sanitize error messages to prevent information disclosure
    let errorMessage = 'Babel compilation failed';
    
    if (error instanceof Error) {
      // Keep the error message but remove potentially sensitive file paths
      const sanitizedMessage = error.message
        .replace(/\/[^\s,;]+/g, '[PATH]') // Remove absolute paths
        .replace(/[A-Za-z]:[^\s,;]+/g, '[PATH]') // Remove Windows paths
        .replace(/(\s|^)\/[^\/\s]+/g, ' [PATH]'); // Remove relative paths starting with /
      
      errorMessage = `Babel compilation failed: ${sanitizedMessage}`;
    }
    
    throw new Error(errorMessage);
  }
}
