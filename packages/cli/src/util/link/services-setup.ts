import { normalizePath } from '@vercel/build-utils';
import { join, relative } from 'path';
import {
  detectServices,
  LocalFileSystemDetector,
  type DetectServicesResult,
  type Service,
} from '@vercel/fs-detectors';
import output from '../../output-manager';
import type Client from '../client';
import {
  displayDetectedServices,
  displayServiceErrors,
  displayServicesConfigNote,
} from '../input/display-services';
import {
  getServicesConfigWriteBlocker,
  type ServicesConfigWriteBlocker,
  writeServicesConfig,
} from '../projects/detect-services';

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
  inferredServices: DetectServicesResult['inferred'];
  inferredServicesWriteBlocker: ServicesConfigWriteBlocker | null;
}

export async function getServicesSetupState(
  workPath: string
): Promise<ServicesSetupState> {
  const detectServicesResult = await detectServices({
    fs: new LocalFileSystemDetector(workPath),
  });
  const hasConfiguredServices =
    detectServicesResult.resolved.source === 'configured';
  const inferredServices = hasConfiguredServices
    ? null
    : detectServicesResult.inferred;
  const inferredServicesWriteBlocker = inferredServices
    ? await getServicesConfigWriteBlocker(workPath, inferredServices.config)
    : null;

  return {
    detectServicesResult,
    hasConfiguredServices,
    inferredServices,
    inferredServicesWriteBlocker,
  };
}

export function displayConfiguredServicesSetup(
  detectServicesResult: DetectServicesResult,
  configFileName = 'vercel.json'
): void {
  if (detectServicesResult.services.length > 0) {
    displayDetectedServices(detectServicesResult.services);
  }
  if (detectServicesResult.errors.length > 0) {
    displayServiceErrors(detectServicesResult.errors);
  }
  displayServicesConfigNote(configFileName);
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
    const webServices = inferred.services.filter(
      service => service.type === 'web'
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
        choice = {
          type: 'single-app',
          selectedPath:
            service.workspace === '.'
              ? workPath
              : join(workPath, service.workspace),
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
  output.log(`Added services configuration to ${configFileName}.`);
  return { type: 'services' };
}
