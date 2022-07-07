import Client from '../client';

export default async function confirm(
  client: Client,
  message: string,
  preferred: boolean
): Promise<boolean> {
  require('./patch-inquirer');

  const answers = await client.prompt({
    type: 'confirm',
    name: 'value',
    message,
    default: preferred,
  });

  return answers.value;
}
