//      
import path from 'path';
import { CantParseJSONFile } from '../../util/errors';
import readJSONFile from './read-json-file';
                                               

                       
               
              
  

async function readPackage(file         ) {
  const pkgFilePath = file || path.resolve(process.cwd(), 'package.json');
  const result = await readJSONFile(pkgFilePath);
  if (result instanceof CantParseJSONFile) {
    return result;
  }

  if (result !== null) {
    const pkg          = result;
    return pkg;
  }

  return result;
}

export default readPackage;
