const fs = require('fs-extra');

const TRANSIENT_RETRY_PATTERNS = [
  {
    reason: 'network transport error',
    pattern:
      /\b(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|socket hang up)\b/i,
  },
  {
    reason: 'preview deployment lookup timeout/failure',
    pattern:
      /No Vercel preview deployment found for any commit in this PR|wait-for-vercel-preview/i,
  },
  {
    reason: 'tarball fetch/transient HTTP failure',
    pattern:
      /tarballs\/.+\.(json|tgz)|ERR_PNPM_FETCH|fetch failed|Service Unavailable|Gateway Timeout/i,
  },
];

function classifyFailure(output) {
  for (const rule of TRANSIENT_RETRY_PATTERNS) {
    if (rule.pattern.test(output)) {
      return {
        shouldRetry: true,
        reason: rule.reason,
      };
    }
  }

  return {
    shouldRetry: false,
    reason: 'non-transient failure signature',
  };
}

async function main(logFilePath) {
  if (!logFilePath) {
    throw new Error('Expected a path to a test log file.');
  }

  const output = await fs.readFile(logFilePath, 'utf8');
  const result = classifyFailure(output);

  console.log(result.reason);
  if (result.shouldRetry) {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }

  return result;
}

if (require.main === module) {
  main(process.argv[2]).catch(err => {
    console.error('error determining retryability', err);
    process.exit(1);
  });
}

module.exports = {
  classifyFailure,
  TRANSIENT_RETRY_PATTERNS,
};
