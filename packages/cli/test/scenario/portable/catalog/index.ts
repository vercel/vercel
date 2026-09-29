import type { Catalog } from '../model/schemas';
import { capabilitiesCatalog } from './capabilities';
import { errorsCatalog } from './errors';
import { faultsCatalog } from './faults';
import { operationsCatalog } from './operations';

/** TS source of truth for the generated `catalog/*.json` artifacts. */
export const catalog: Catalog = {
  operations: operationsCatalog,
  faults: faultsCatalog,
  errors: errorsCatalog,
  capabilities: capabilitiesCatalog,
};
