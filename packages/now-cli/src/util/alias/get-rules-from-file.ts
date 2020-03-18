import path from 'path';
import * as ERRORS from '../errors-ts';
import humanizePath from '../humanize-path';
import readJSONFile from '../read-json-file';
import validatePathAliasRules from './validate-path-alias-rules';
import { PathRule } from '../../types';

export default async function getRulesFromFile(filePath: string) {
  return typeof filePath === 'string' ? readRulesFile(filePath) : null;
}

async function readRulesFile(rulesPath: string) {
  const fullPath = path.resolve(process.cwd(), rulesPath);
  const result = (await readJSONFile(fullPath)) as { [key: string]: any };
  if (result instanceof ERRORS.CantParseJSONFile) {
    return result;
  }

  if (result === null) {
    return new ERRORS.FileNotFound(fullPath);
  }

  if (!result.rules) {
    return new ERRORS.RulesFileValidationError(
      humanizePath(fullPath),
      'Your rules file must include a rules field'
    );
  }

  const rules = result.rules as PathRule[];
  const error = validatePathAliasRules(humanizePath(fullPath), rules);
  if (error instanceof ERRORS.RulesFileValidationError) {
    return error;
  }

  return rules;
}
