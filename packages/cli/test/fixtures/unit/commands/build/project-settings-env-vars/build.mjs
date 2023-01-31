import fs from 'fs/promises';
import { join } from 'path';
await fs.mkdir(join(__dirname , 'out'), { recursive: true });
await fs.writeFile(join(__dirname , 'out', 'env.json'), JSON.stringify(process.env));
