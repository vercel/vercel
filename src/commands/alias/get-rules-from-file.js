// @flow
import path from 'path';
import humanizePath from '../../util/humanize-path';
import type { PathRule } from '../../util/types';
import {
  CantParseJSONFile,
  FileNotFound,
  RulesFileValidationError
} from '../../util/errors';
import validatePathAliasRules from './validate-path-alias-rules';
import readJSONFile from './read-json-file';

type JSONRules = {
  rules: PathRule[]
};

async function getRulesFromFile(filePath: string) {
  return typeof filePath === 'string' ? await readRulesFile(filePath) : null;
}

async function readRulesFile(rulesPath: string) {
  const fullPath = path.resolve(process.cwd(), rulesPath);
  const result = await readJSONFile(fullPath);
  if (result instanceof CantParseJSONFile) {
    return result;
  } else if (result === null) {
    return new FileNotFound(fullPath);
  } else if (!result.rules) {
    return new RulesFileValidationError(
      humanizePath(fullPath),
      'Your rules file must include a rules field'
    );
  }

  const error = validatePathAliasRules(humanizePath(fullPath), result.rules);
  if (error instanceof RulesFileValidationError) {
    return error;
  }

  const json: JSONRules = result;
  return json.rules;
}

export default getRulesFromFile;
