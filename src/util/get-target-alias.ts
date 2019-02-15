import code from './output/code';
import highlight from './output/highlight';

export default function getTargetAlias(
  target: string | null,
  nowConfig: { [key: string]: any }
): string | null {
  if (target === null) {
    return null;
  }

  if (target !== 'production') {
    throw new Error(
      `The ${code('target')} ${highlight(target)} is not supported. ` +
      `Use ${code('--target production')} instead`
    );
  }

  const { alias } = nowConfig;
  const selectedAlias = Array.isArray(alias) ? alias[0] : alias;

  if (!selectedAlias) {
    throw new Error(
      `The ${code('alias')} property in ${highlight('now.json')} ` +
      `is required for ${code('--target')}`
    );
  }

  return selectedAlias;
}
