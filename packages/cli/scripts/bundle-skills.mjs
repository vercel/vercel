import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const skillsDir = fileURLToPath(new URL('../../../skills', import.meta.url));
const BUNDLED_FILES_MODULE =
  /[\\/]src[\\/]util[\\/]skills[\\/]bundled-files\.ts$/;

/**
 * Inlines `skills/vercel-cli` into the CLI bundle, so `vercel setup skills`
 * writes the skill that matches this CLI version without reading the source
 * tree at runtime.
 */
export async function createBundledSkillsPlugin() {
  const { CLI_SKILL_NAME, readSkillDirectory } = await tsImport(
    '../src/util/skills/bundled-files.ts',
    import.meta.url
  );
  const skill = readSkillDirectory(skillsDir, CLI_SKILL_NAME);
  const contents = `export const CLI_SKILL_NAME = ${JSON.stringify(CLI_SKILL_NAME)};
export function readBundledCliSkill() {
  return ${JSON.stringify(skill)};
}
`;

  return {
    name: 'bundle-skills',
    setup(build) {
      let didLoad = false;
      build.onLoad({ filter: BUNDLED_FILES_MODULE }, () => {
        didLoad = true;
        return { contents, loader: 'js' };
      });
      build.onEnd(result => {
        if (result.errors.length === 0 && !didLoad) {
          throw new Error('Build did not inline the bundled vercel-cli skill');
        }
      });
    },
  };
}
