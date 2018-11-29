//
import path from 'path';
import humanizePath from '../../util/humanize-path';

import {
  CantParseJSONFile,
  FileNotFound,
  RulesFileValidationError
} from '../../util/errors';
import validatePathAliasRules from './validate-path-alias-rules';
import readJSONFile from './read-json-file';





async function getRulesFromFile(filePath        ) {
  return typeof filePath === 'string' ? readRulesFile(filePath) : null;
}

async function readRulesFile(rulesPath        ) {
  const fullPath = path.resolve(process.cwd(), rulesPath);
  const result = await readJSONFile(fullPath);
  if (result instanceof CantParseJSONFile) {
    return result;
  } if (result === null) {
    return new FileNotFound(fullPath);
  } if (!result.rules) {
    return new RulesFileValidationError(
      humanizePath(fullPath),
      'Your rules file must include a rules field'
    );
  }

  const error = validatePathAliasRules(humanizePath(fullPath), result.rules);
  if (error instanceof RulesFileValidationError) {
    return error;
  }

  const json            = result;
  return json.rules;
}

export default getRulesFromFile;
