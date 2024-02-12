const { writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { trace } = require('./trace');
const { generateMermaidOutput } = require('./generate-mermaid-output');
const { rootDirectory } = require('./root-directory');
const { mkdirSync } = require('fs');

const outputPath = join(__dirname, '..', 'output');
rmSync(outputPath, { recursive: true, force: true });
mkdirSync(outputPath);

const inputFile = 'packages/cli/src/index.ts';

const traceOutput = trace(join(rootDirectory, inputFile));
const traceOutputPath = join(outputPath, 'trace.json');

writeFileSync(traceOutputPath, JSON.stringify(traceOutput, null, 2));

const mermaid = generateMermaidOutput(inputFile, traceOutputPath);
const traceMermaidOutputPath = join(outputPath, 'trace.mmd');

writeFileSync(traceMermaidOutputPath, mermaid);
