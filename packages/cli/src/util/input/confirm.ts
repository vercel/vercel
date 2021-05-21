import inquirer from 'inquirer';

export default async function confirm(
  message: string,
  preferred: boolean
): Promise<boolean> {
  require('./patch-inquirer');

  const answers = await inquirer.prompt({
    type: 'confirm',
    name: 'value',
    message,
    default: preferred,
  });

  return answers.value;
}
