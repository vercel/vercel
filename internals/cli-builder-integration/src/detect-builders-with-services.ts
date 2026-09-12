import type {
  BuilderFunctions,
  ExperimentalServices,
  ExperimentalServicesV2,
  PackageJson,
  ProjectSettings,
  Service,
  Services,
} from '@vercel/build-utils';
import {
  detectBuilders,
  getProxyBuilder,
  validateProxy,
  type DetectBuildersOptions,
} from '@vercel/fs-detectors';
import type { Rewrite, Route } from '@vercel/routing-utils';
import {
  getServicesBuilders,
  warnIgnoredDirectories,
} from './get-services-builders';

export interface DetectBuildersWithServicesOptions
  extends DetectBuildersOptions {
  experimentalServices?: ExperimentalServices;
  services?: Services;
  experimentalServicesV2?: ExperimentalServicesV2;
  projectSettings?: ProjectSettings;
  functions?: BuilderFunctions;
}

type DetectBuildersWithServicesResult = Awaited<
  ReturnType<typeof detectBuilders>
> & {
  hostRewriteRoutes?: Route[] | null;
  fallbackRoutes?: Route[] | null;
  serviceRewrites?: Rewrite[];
  experimentalServicesV2?: Services;
  services?: Service[];
  useImplicitEnvInjection?: boolean;
};

export async function detectBuildersWithServices(
  files: string[],
  pkg?: PackageJson | undefined | null,
  options: DetectBuildersWithServicesOptions = {}
): Promise<DetectBuildersWithServicesResult> {
  const {
    experimentalServices: experimentalServicesV1,
    services,
    experimentalServicesV2,
    projectSettings = {},
  } = options;

  if (services != null && experimentalServicesV2 != null) {
    return {
      builders: null,
      errors: [
        {
          code: 'SERVICES_AND_EXPERIMENTAL_SERVICES_V2',
          message:
            'The `services` option cannot be used in conjunction with its deprecated alias `experimentalServicesV2`. Please use only `services`.',
        },
      ],
      warnings: [],
      defaultRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  const proxyError = validateProxy(options, files, projectSettings.framework);
  if (proxyError) {
    return {
      builders: null,
      errors: [proxyError],
      warnings: [],
      defaultRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  const servicesConfig = services ?? experimentalServicesV2;
  const configuredServices = servicesConfig ?? experimentalServicesV1;
  const configuredServicesType = servicesConfig
    ? services
      ? 'services'
      : 'experimentalServicesV2'
    : 'experimentalServices';
  const hasServicesConfig =
    configuredServices != null && typeof configuredServices === 'object';

  if (!hasServicesConfig && projectSettings.framework !== 'services') {
    return detectBuilders(files, pkg, options);
  }

  const result = await getServicesBuilders({
    workPath: options.workPath,
    configuredServices,
    configuredServicesType,
    projectFramework: projectSettings.framework,
  });

  if (configuredServices != null) {
    result.warnings.push(...warnIgnoredDirectories(files, configuredServices));
  }

  if (!result.errors && options.proxy) {
    result.builders = [
      getProxyBuilder(options.proxy, options.tag, options.functions),
      ...(result.builders ?? []),
    ];
  }

  return result;
}
