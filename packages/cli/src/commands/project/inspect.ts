import chalk from 'chalk';
import { getCommandName } from '../../util/pkg-name';
import { ProjectInspectTelemetryClient } from '../../util/telemetry/commands/project/inspect';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { formatProject } from '../../util/projects/format-project';
import stamp from '../../util/output/stamp';
import getTeamById from '../../util/teams/get-team-by-id';
import formatDate from '../../util/format-date';
import type Client from '../../util/client';

export default async function inspect(
    client: Client,
    argv: string[]
): Promise<number> {
    const telemetry = new ProjectInspectTelemetryClient({
        opts: {
            store: client.telemetryEventStore,
        },
    });

    let parsedArgs;
    const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
    try {
        parsedArgs = parseArguments(argv, flagsSpecification);
    } catch (error) {
        printError(error);
        return 1;
    }
    const { args } = parsedArgs;

    const name = args[0];
    telemetry.trackCliArgumentName(name);
    telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

    if (args.length !== 0 && args.length !== 1) {
        output.error(
            `Invalid number of arguments. Usage: ${chalk.cyan(
                `${getCommandName('project inspect <name>')}`
            )}`
        );
        return 2;
    }

    const inspectStamp = stamp();
    const project = await getProjectByCwdOrLink({
        autoConfirm: parsedArgs.flags['--yes'],
        client,
        commandName: 'project inspect',
        projectNameOrId: name,
    });

    const org = await getTeamById(client, project.accountId);
    const projectSlugLink = formatProject(org.slug, project.name);
    console.log(project);

    output.log(
        `Found Project ${projectSlugLink} ${chalk.gray(
            inspectStamp()
        )}`
    );
    output.print('\n');
    output.print(chalk.bold('  General\n\n'));
    output.print(`    ${chalk.cyan('Name')}\t\t\t${project.name}\n`);
    output.print(
        `    ${chalk.cyan('Created At')}\t\t\t${formatDate(project.createdAt)}\n`
    );

    return 0;
}

/*
function getLatestProdUrl(project: Project): string {
    const alias = project.targets?.production?.alias?.[0];
    if (alias) return `https://${alias}`;
    return '--';
}
*/
