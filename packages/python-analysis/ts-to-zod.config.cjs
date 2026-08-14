/**
 * ts-to-zod configuration.
 *
 * @type {import("ts-to-zod").TsToZodConfig}
 */
module.exports = [
  {
    name: 'requirement',
    input: 'src/manifest/requirement/types.ts',
    output: 'src/manifest/requirement/schema.zod.ts',
  },
  {
    name: 'uv-config',
    input: 'src/manifest/uv-config/types.ts',
    output: 'src/manifest/uv-config/schema.zod.ts',
  },
  {
    name: 'pipfile',
    input: 'src/manifest/pipfile/types.ts',
    output: 'src/manifest/pipfile/schema.zod.ts',
  },
  {
    name: 'pyproject',
    input: 'src/manifest/pyproject/types.ts',
    output: 'src/manifest/pyproject/schema.zod.ts',
  },
];
