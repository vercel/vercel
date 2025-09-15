#!/usr/bin/env node

// @ts-check
/**
 * Test script to check affected packages detection locally
 * Usage: node utils/test-affected.js [base-sha]
 */

const { getAffectedPackages } = require('./get-affected-packages');
const child_process = require('child_process');

async function main() {
  const baseSha = process.argv[2] || process.env.TURBO_BASE_SHA;

  if (!baseSha) {
    console.error('Usage: node utils/test-affected.js <base-sha>');
    console.error('Or set TURBO_BASE_SHA environment variable');
    process.exit(1);
  }

  console.log(`Testing affected packages detection against base: ${baseSha}`);
  console.log('');

  try {
    // First show what git thinks changed
    const gitDiff = child_process.execSync(
      `git diff --name-only ${baseSha} HEAD`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      }
    );

    console.log('Files changed according to git:');
    console.log(gitDiff);
    console.log('');

    // Now show what turbo thinks is affected
    const affectedPackages = await getAffectedPackages(baseSha);

    if (affectedPackages.length === 0) {
      console.log('No affected packages found - would test all packages');
    } else {
      console.log('Affected packages that would be tested:');
      affectedPackages.forEach(pkg => console.log(`  - ${pkg}`));
    }

    console.log('');
    console.log('This would result in the following turbo filters:');
    if (affectedPackages.length === 0) {
      console.log('  (no filters - test all packages)');
    } else {
      affectedPackages.forEach(pkg => console.log(`  --filter=${pkg}...`));
    }

    // Show e2e test strategy
    console.log('');
    console.log('E2E Test Strategy:');
    const {
      getChangedFiles,
      shouldRunAllE2ETests,
    } = require('./get-affected-packages');
    try {
      const changedFiles = await getChangedFiles(baseSha);
      const runAllE2E = shouldRunAllE2ETests(changedFiles);

      if (runAllE2E) {
        console.log(
          '  ⚠️  Infrastructure changes detected - ALL e2e tests will run'
        );
        console.log(
          '  This ensures integration between packages is properly tested'
        );
      } else {
        console.log('  ✅ Only affected package e2e tests will run');
        console.log('  This saves time while maintaining safety');
      }
    } catch (e) {
      console.log('  (Could not determine e2e strategy)');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
