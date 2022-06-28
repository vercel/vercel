import inquirer from 'inquirer';
import Client from '../client';

export default async function confirm(
  client: Client,
  message: string,
  preferred: boolean
): Promise<boolean> {
  require('./patch-inquirer');

  const prompt = inquirer.createPromptModule({
    input: client.stdin,
    output: client.stdout,
  });

  const answers = await prompt({
    type: 'confirm',
    name: 'value',
    message,
    default: preferred,
  });

  return answers.value;
}
