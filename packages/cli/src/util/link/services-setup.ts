import {
  isExperimentalService,
  isExperimentalServiceV2,
  normalizePath,
  type Service,
} from '@vercel/build-utils';
import { join, relative } from 'path';
import { LocalFileSystemDetector } from '@vercel/fs-detectors';
import {
  detectDaemons,
  detectServices,
  type DetectedDaemon,
  type DetectServicesResult,
} from '@vercel-internals/service-topology';
import output from '../../output-manager';
import type Client from '../client';
import {
  displayDetectedDaemons,
  displayDetectedServices,
  displayServiceErrors,
  displayServicesConfigNote,
  getNameColumnWidth,
} from '../input/display-services';
import {
  getServicesConfigWriteBlocker,
  type ServicesConfigWriteBlocker,
  writeServicesConfig,
} from '../projects/detect-services';
import { createDetectEntrypoint } from '../projects/detect-entrypoint';

const SERVICES_DOCS_URL = 'https://vercel.com/docs/services';
const INFERRED_SERVICES_PROMPT =
  'Multiple services were detected. How would you like to set up this project?';

export type InferredServicesChoice =
  | { type: 'services' }
  | { type: 'project-directory' }
  | { type: 'single-app'; selectedPath: string };

export interface ServicesSetupState {
  detectServicesResult: DetectServicesResult;
  hasConfiguredServices: boolean;
  /** `vercel.json#daemons`, read only when services are configured. */
  daemons: DetectedDaemon[];
  inferredServices: DetectServicesResult['inferred'];
  inferredServicesWriteBlocker: ServicesConfigWriteBlocker | null;
}

export async function getServicesSetupState(
  workPath: string
): Promise<ServicesSetupState> {
  // Services and daemons are both read from this directory's vercel.json or
  // vercel.toml, so they always come from the same config.
  const fs = new LocalFileSystemDetector(workPath);
  const detectServicesResult = await detectServices({
    fs,
    detectEntrypoint: createDetectEntrypoint(workPath),
  });
  // `resolved` is undefined when no services are detected at all (common for
  // empty or simple fixtures). Defensive optional chain avoids crashing the
  // setup flow before any prompts can fire.
  const hasConfiguredServices =
    detectServicesResult.resolved?.source === 'configured';
  const inferredServices = hasConfiguredServices
    ? null
    : detectServicesResult.inferred;
  const inferredServicesWriteBlocker = inferredServices
    ? await getServicesConfigWriteBlocker(workPath, inferredServices.config)
    : null;
  const daemons = hasConfiguredServices ? await detectDaemons({ fs }) : [];

  return {
    detectServicesResult,
    hasConfiguredServices,
    daemons,
    inferredServices,
    inferredServicesWriteBlocker,
  };
}

export function displayConfiguredServicesSetup(
  { detectServicesResult, daemons }: ServicesSetupState,
  configFileName = 'vercel.json'
): void {
  const { services } = detectServicesResult;
  // One name-column width for both tables, so their brackets line up.
  const nameWidth = getNameColumnWidth(
    [...services, ...daemons].map(({ name }) => name)
  );
  if (services.length > 0) {
    displayDetectedServices(services, nameWidth);
  }
  if (daemons.length > 0) {
    if (services.length > 0) {
      output.print('\n');
    }
    displayDetectedDaemons(daemons, nameWidth);
  }
  if (detectServicesResult.errors.length > 0) {
    displayServiceErrors(detectServicesResult.errors);
  }
  displayServicesConfigNote(configFileName, daemons.length > 0);
}

function formatDetectedServicesSummary(services: Service[]): string {
  if (services.length === 0) {
    return '';
  }
  if (services.length === 1) {
    return `"${services[0].name}"`;
  }
  if (services.length === 2) {
    return `"${services[0].name}" + "${services[1].name}"`;
  }
  const othersCount = services.length - 2;
  return `"${services[0].name}" + "${services[1].name}" + ${othersCount} ${
    othersCount === 1 ? 'other' : 'others'
  }`;
}

export function toProjectRootDirectory(
  projectPath: string,
  selectedPath: string
): string | null {
  const rootDirectory = normalizePath(relative(projectPath, selectedPath));
  return rootDirectory === '' ? null : rootDirectory;
}

export async function promptForInferredServicesSetup({
  client,
  autoConfirm,
  nonInteractive,
  workPath,
  inferred,
  inferredWriteBlocker,
  allowChooseDifferentProjectDirectory = false,
}: {
  client: Client;
  autoConfirm: boolean;
  nonInteractive: boolean;
  workPath: string;
  inferred: DetectServicesResult['inferred'];
  inferredWriteBlocker: ServicesConfigWriteBlocker | null;
  allowChooseDifferentProjectDirectory?: boolean;
}): Promise<InferredServicesChoice | null> {
  if (!inferred) {
    return null;
  }

  if (inferredWriteBlocker) {
    output.warn(
      `Multiple services were detected, but your existing project config uses \`${inferredWriteBlocker}\`. To deploy multiple services in one project, see ${output.link('Services', SERVICES_DOCS_URL)}.`
    );
    return null;
  }

  displayDetectedServices(inferred.services);

  let choice: InferredServicesChoice | null = null;
  if (autoConfirm) {
    choice = { type: 'services' };
  } else if (!nonInteractive) {
    const webServices = inferred.services.filter(service =>
      isExperimentalService(service) ? service.type === 'web' : true
    );
    const choices: Array<{ name: string; value: string }> = [
      {
        name: `Set up project with all detected services: ${formatDetectedServicesSummary(
          inferred.services
        )}`,
        value: 'services',
      },
      ...webServices.map((service, index) => ({
        name: `Set up project with "${service.name}"`,
        value: `single-app:${index}`,
      })),
      ...(allowChooseDifferentProjectDirectory
        ? [
            {
              name: 'Choose a different root directory',
              value: 'project-directory',
            },
          ]
        : []),
    ];

    const selected: unknown = await client.input.select({
      message: INFERRED_SERVICES_PROMPT,
      choices,
    });

    if (selected === 'services') {
      choice = { type: 'services' };
    } else if (selected === 'project-directory') {
      choice = { type: 'project-directory' };
    } else if (
      typeof selected === 'string' &&
      selected.startsWith('single-app:')
    ) {
      const index = Number.parseInt(selected.slice('single-app:'.length), 10);
      const service = webServices[index];
      if (service) {
        const serviceRoot = isExperimentalServiceV2(service)
          ? service.root
          : service.workspace;
        choice = {
          type: 'single-app',
          selectedPath:
            serviceRoot === '.' ? workPath : join(workPath, serviceRoot),
        };
      }
    }
  }

  if (choice?.type !== 'services') {
    return choice;
  }

  const { configFileName } = await writeServicesConfig(
    workPath,
    inferred.config
  );
  output.print(`  Added services configuration to ${configFileName}.\n`);
  return { type: 'services' };
}
