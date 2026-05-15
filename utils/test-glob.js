// @ts-check
const fs = require('node:fs');
const path = require('node:path');

const TEST_FILE_NAME_PARTS = ['test', 'spec'];

/**
 * Expand the small subset of glob patterns used by package test scripts.
 *
 * This intentionally avoids depending on the `glob` npm package in Find
 * Changes. Installing even a tiny extra package from the repo root makes npm
 * resolve the workspace package graph, which has peer dependency conflicts and
 * pulls hundreds of packages. Find Changes runs on every PR, so keeping this
 * matcher dependency-free is faster and less fragile.
 *
 * Supported patterns cover the existing test metadata:
 * - exact files: `test/unit.test.ts`
 * - directories: `test/unit/`
 * - single-segment wildcards: `test/integration-*`
 * - recursive wildcards, for example all `.test.ts` files under `test/unit`
 */
function expandTestPattern(packageRoot, pattern, defaultTestPatterns) {
  const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  const absolutePattern = path.join(packageRoot, normalizedPattern);

  if (fs.existsSync(absolutePattern)) {
    const stat = fs.statSync(absolutePattern);
    if (stat.isDirectory()) {
      return defaultTestPatterns.flatMap(defaultPattern =>
        expandTestPattern(
          absolutePattern,
          defaultPattern.replace(/^test\//, ''),
          defaultTestPatterns
        )
      );
    }
    return [absolutePattern];
  }

  const matcher = globPatternToRegExp(normalizedPattern);
  let matches = walkFiles(packageRoot)
    .filter(filePath =>
      matcher.test(path.relative(packageRoot, filePath).replace(/\\/g, '/'))
    )
    .sort((a, b) => a.localeCompare(b));

  // Patterns like `test/integration-*` were previously filtered by Jest's
  // `--listTests`; only actual `*.test.*` / `*.spec.*` files should survive.
  // Without this, helper files such as `integration-setup.js` become matrix
  // entries and fail with "No tests found".
  if (
    hasWildcard(normalizedPattern) &&
    !isLikelyTestPatternName(normalizedPattern)
  ) {
    matches = matches.filter(isTestFile);
  }

  // Exclude test-named files (*.test.* / *.spec.*) under fixtures/ directories.
  // These are framework source files (Angular, Aurelia, React, etc.) that use
  // test naming conventions but are not meant to be run by this package's runner.
  matches = matches.filter(
    filePath =>
      !(
        filePath.replace(/\\/g, '/').includes('/fixtures/') &&
        isTestFile(filePath)
      )
  );

  return matches;
}

function hasWildcard(pattern) {
  return pattern.includes('*') || pattern.includes('?');
}

function isLikelyTestPatternName(pattern) {
  return TEST_FILE_NAME_PARTS.some(name => pattern.includes(`.${name}.`));
}

function isTestFile(filePath) {
  return TEST_FILE_NAME_PARTS.some(name =>
    new RegExp(`\\.${name}\\.[^.]+$`).test(filePath)
  );
}

function globPatternToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];
    const followingChar = pattern[index + 2];

    if (char === '*' && nextChar === '*' && followingChar === '/') {
      source += '(?:.*/)?';
      index += 2;
    } else if (char === '*' && nextChar === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }
  source += '$';
  return new RegExp(source);
}

function escapeRegExp(char) {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.turbo'
    ) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

module.exports = {
  expandTestPattern,
};
