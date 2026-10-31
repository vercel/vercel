import { readFile, writeFile } from 'node:fs/promises';

const schema = new URL('./src/schema.zod.ts', import.meta.url);
const source = await readFile(schema, 'utf8');
// ts-to-zod emits the exported `z` object, which retains all of Zod when
// bundled. A module namespace lets esbuild retain only the schema APIs used.
await writeFile(
  schema,
  source.replace(
    /import \{ z \} from (['"])zod\1;/,
    "import * as z from 'zod';"
  )
);
