import Ajv from 'ajv';
import {
  DEFAULT_MAX_DURATION_LIMIT,
  SKIP_MAX_DURATION_LIMIT_ENV,
} from '@vercel/build-utils';
import { build as esbuild } from 'esbuild';
import { tsImport } from 'tsx/esm/api';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cliDir = fileURLToPath(new URL('..', import.meta.url));
const outputPath = fileURLToPath(
  new URL('../dist/chunks/config-validator.mjs', import.meta.url)
);

export async function createConfigValidatorPlugin() {
  await generateConfigValidator();

  return {
    name: 'precompile-config-validator',
    setup(build) {
      let didResolve = false;
      build.onResolve({ filter: /^\.\/config-validator$/ }, args => {
        if (args.importer.endsWith('validate-config.ts')) {
          didResolve = true;
          return { path: './config-validator.mjs', external: true };
        }
      });
      build.onEnd(result => {
        if (result.errors.length === 0 && !didResolve) {
          throw new Error('Build did not use the precompiled config validator');
        }
      });
    },
  };
}

export async function generateConfigValidator() {
  const { buildVercelConfigSchema } = await tsImport(
    '../src/util/validate-config.ts',
    import.meta.url
  );
  const previousSkipMaxDuration = process.env[SKIP_MAX_DURATION_LIMIT_ENV];

  let schema;
  try {
    delete process.env[SKIP_MAX_DURATION_LIMIT_ENV];
    schema = buildVercelConfigSchema();
  } finally {
    if (previousSkipMaxDuration === undefined) {
      delete process.env[SKIP_MAX_DURATION_LIMIT_ENV];
    } else {
      process.env[SKIP_MAX_DURATION_LIMIT_ENV] = previousSkipMaxDuration;
    }
  }

  const validator = precompile(schema);
  mkdirSync(fileURLToPath(new URL('../dist/chunks', import.meta.url)), {
    recursive: true,
  });
  await esbuild({
    stdin: {
      contents: `
        import { getMaxDurationLimit } from '@vercel/build-utils';
        const validator = ${validator};
        export function getConfigValidator() {
          return validator;
        }
      `,
      resolveDir: cliDir,
    },
    bundle: true,
    external: ['@vercel/build-utils'],
    format: 'esm',
    minify: true,
    outfile: outputPath,
    platform: 'node',
  });

  return outputPath;
}

// Ajv 6 exposes generated source plus its closure values, rather than a
// standalone module, so serialize both here.
function precompile(schema) {
  const ajv = new Ajv({ sourceCode: true });
  const validate = ajv.compile(schema);
  if (validate.refVal.length !== 1 || validate.refVal[0] !== validate) {
    throw new Error('Unsupported referenced validator in vercel.json schema');
  }

  const patterns = validate.source.patterns
    .map(
      (pattern, index) =>
        `const pattern${index} = new RegExp(${JSON.stringify(pattern)});`
    )
    .join('\n');
  const defaults = validate.source.defaults
    .map((value, index) => `const default${index} = ${JSON.stringify(value)};`)
    .join('\n');

  // Keep the environment-gated maximum dynamic without shipping two copies of
  // this large validator. All uses of this limit in the schema are maxDuration.
  const maximumCheck = ` > ${DEFAULT_MAX_DURATION_LIMIT}`;
  const maximumChecks = validate.toString().split(maximumCheck).length - 1;
  const schemaMaximums = countMaxDurationMaximums(schema);
  if (maximumChecks !== schemaMaximums) {
    throw new Error('Could not make maxDuration validation dynamic');
  }
  const validatorSource = validate
    .toString()
    .replaceAll(maximumCheck, ' > getMaxDurationLimit()');

  return `(() => {
    const formats = require('ajv/lib/compile/formats')();
    const ucs2length = require('ajv/lib/compile/ucs2length');
    const equal = require('ajv/lib/compile/equal');
    const refVal = [];
    ${patterns}
    ${defaults}
    const validate = (${validatorSource});
    validate.schema = ${JSON.stringify(validate.schema)};
    validate.errors = null;
    return validate;
  })()`;
}

function countMaxDurationMaximums(value, insideMaxDuration = false) {
  if (!value || typeof value !== 'object') return 0;

  let count = 0;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'maximum' && child === DEFAULT_MAX_DURATION_LIMIT) {
      if (!insideMaxDuration) {
        throw new Error('Default maxDuration limit used by another schema');
      }
      count++;
    } else {
      count += countMaxDurationMaximums(
        child,
        insideMaxDuration || key === 'maxDuration'
      );
    }
  }
  return count;
}
