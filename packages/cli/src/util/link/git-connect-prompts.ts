import { Dictionary } from '@vercel/client';
import Client from '../client';
import list from '../input/list';

export async function promptGitConnectSingleUrl(
  client: Client,
  replace = false
) {
  return await list(client, {
    message: replace
      ? 'Do you want to replace it?'
      : 'Do you want to connect it to your Vercel project?',
    choices: [
      {
        name: 'Yes',
        value: 'yes',
        short: 'yes',
      },
      {
        name: 'No',
        value: 'no',
        short: 'no',
      },
      {
        name: 'Do not ask again for this project',
        value: 'opt-out',
        short: 'no (opt out)',
      },
    ],
  });
}

export async function promptGitConnectMultipleUrls(
  client: Client,
  remoteUrls: Dictionary<string>
) {
  const staticOptions = [
    {
      name: 'No',
      value: 'no',
      short: 'no',
    },
    {
      name: 'Do not ask again for this project',
      value: 'opt-out',
      short: 'no (opt out)',
    },
  ];
  let choices = [];
  for (const url of Object.values(remoteUrls)) {
    choices.push({
      name: url,
      value: url,
      short: url,
    });
  }
  choices = choices.concat(staticOptions);

  return await list(client, {
    message: 'Do you want to connect a Git repository to your Vercel project?',
    choices,
  });
}
