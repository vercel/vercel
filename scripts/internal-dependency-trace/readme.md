# Internal Dependency Trace

This script will generate a [Mermaid](https://mermaid.js.org/intro/) directed graph as an SVG image showing the dependency connections between files starting with the input file as an entrypoint.

1. Set input file in `src/index.js`
1. `pnpm i`
1. `pnpm generate`
1. Open `output/trace.svg` in a browser
