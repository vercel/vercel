import inquirer from 'inquirer';
import './patch-inquirer';

export default async function confirm(
  message: string,
  preferred: boolean
): Promise<boolean> {
  const name = `${Date.now()}`;

  const answers = await inquirer.prompt({
    type: 'confirm',
    name,
    message,
    default: preferred,
  });

  const answer = answers[name] as boolean;
  return answer;
}
