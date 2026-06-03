import { createDatabaseClient } from './client';
import type { DatabaseClient } from './client';

// Top-level instantiation at module-load time, mirroring azzapp's pattern.
// This forces @planetscale/database (transitive workspace dep) to be
// resolvable at the moment data's index.cjs is loaded.
const client = createDatabaseClient();

export const db = (): DatabaseClient => client;
