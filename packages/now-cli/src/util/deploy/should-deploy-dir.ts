import { homedir } from 'os';
import promptBool from '../input/prompt-bool';
import { Output } from '../output';

export default async function shouldDeployDir(argv0: string, output: Output) {
  let yes = true;
  if (argv0 === homedir()) {
    if (
      !(await promptBool(
        'You are deploying your home directory. Do you want to continue?'
      ))
    ) {
      output.log('Aborted');
      yes = false;
    }
  }
  return yes;
}
