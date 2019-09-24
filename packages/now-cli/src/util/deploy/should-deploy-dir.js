import { homedir } from 'os';
import promptBool from '../input/prompt-bool';

export default async function shouldDeployDir(argv0, output) {
  let yes = true;
  if (argv0 === homedir()) {
    yes = await promptBool(
      'You are deploying your home directory. Do you want to continue?'
    );
    if (!yes) {
      output.log('Aborted');
    }
  }
  return yes;
}
