export const bash = `#!/bin/bash
set -euo pipefail
exec node --expose-gc --max-semi-space-size=$((AWS_LAMBDA_FUNCTION_MEMORY_SIZE * 5 / 100)) --max-old-space-size=$((AWS_LAMBDA_FUNCTION_MEMORY_SIZE * 90 / 100)) "$LAMBDA_RUNTIME_DIR/now_init.js"
`;

export const javascript = `import { join } from 'path';
import { spawn } from 'child_process';
const nodeBin = join(__dirname, 'bin', 'node');
const bootstrap = join(__dirname, 'now_init.js');
spawn(nodeBin, [ bootstrap ], { stdio: 'inherit' });
`;
