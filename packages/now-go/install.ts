import { downloadGo } from './go-helpers';

downloadGo().catch(err => {
  console.error(err);
  process.exit(1);
});
