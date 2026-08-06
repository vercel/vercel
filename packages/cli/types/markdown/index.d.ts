/**
 * Markdown files imported from source are inlined as strings by the esbuild
 * `text` loader. This lets prompt and instruction content live in `.md` files
 * that can be reviewed as prose and diffed in pull requests, while still being
 * bundled into `dist` with no runtime file resolution.
 */
declare module '*.md' {
  const content: string;
  export default content;
}
