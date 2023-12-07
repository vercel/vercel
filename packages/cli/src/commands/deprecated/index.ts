import Client from "../../util/client";
import getArgs from "../../util/get-args";
import getInvalidSubcommand from "../../util/get-invalid-subcommand";
import getScope from "../../util/get-scope";
import handleError from "../../util/handle-error";
import { help } from "../help";
import { deprecatedCommand } from "./command";

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2));
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(deprecatedCommand, { columns: client.stderr.columns }));
    return 2;
  }

  argv._ = argv._.slice(1);
  const subcommand = argv._[0];
  const args = argv._.slice(1);
  const scope = await getScope(client);

  switch(subcommand) {
    case 'ls':
      return await ls(client, argv, args, scope.contextName);
    default:
      client.output.error(getInvalidSubcommand({ ls: ['ls'] }));
      client.output.print(help(deprecatedCommand, { columns: client.stderr.columns }));
      return 2;
  }
}

async function ls(client: Client, argv: unknown, args: string[], contextName: string) {

}
