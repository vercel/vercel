import { TelemetryClient } from '.';

export class RootTelemetryClient extends TelemetryClient {
  trackCliExtension(extension: string | undefined) {
    if (extension) {
      this.trackExtension(extension);
    }
  }

  trackCliDefaultDeploy(defaultDeploy: boolean) {
    if (defaultDeploy) {
      this.trackDefaultDeploy();
    }
  }

  trackCliCommandAlias(actual: string) {
    this.trackCliCommand({
      command: 'alias',
      value: actual,
    });
  }

  trackCliCommandBisect(actual: string) {
    this.trackCliCommand({
      command: 'bisect',
      value: actual,
    });
  }

  trackCliCommandBuild(actual: string) {
    this.trackCliCommand({
      command: 'build',
      value: actual,
    });
  }

  trackCliCommandCerts(actual: string) {
    this.trackCliCommand({
      command: 'certs',
      value: actual,
    });
  }

  trackCliCommandDeploy(actual: string) {
    this.trackCliCommand({
      command: 'deploy',
      value: actual,
    });
  }

  trackCliCommandDev(actual: string) {
    this.trackCliCommand({
      command: 'dev',
      value: actual,
    });
  }

  trackCliCommandDomains(actual: string) {
    this.trackCliCommand({
      command: 'domains',
      value: actual,
    });
  }

  trackCliCommandDns(actual: string) {
    this.trackCliCommand({
      command: 'dns',
      value: actual,
    });
  }

  trackCliCommandEnv(actual: string) {
    this.trackCliCommand({
      command: 'env',
      value: actual,
    });
  }

  trackCliCommandGit(actual: string) {
    this.trackCliCommand({
      command: 'git',
      value: actual,
    });
  }

  trackCliCommandHelp(actual: string) {
    this.trackCliCommand({
      command: 'help',
      value: actual,
    });
  }

  trackCliCommandInit(actual: string) {
    this.trackCliCommand({
      command: 'init',
      value: actual,
    });
  }

  trackCliCommandInspect(actual: string) {
    this.trackCliCommand({
      command: 'inspect',
      value: actual,
    });
  }

  trackCliCommandInstall(actual: string) {
    this.trackCliCommand({
      command: 'install',
      value: actual,
    });
  }

  trackCliCommandIntegration(actual: string) {
    this.trackCliCommand({
      command: 'integration',
      value: actual,
    });
  }

  trackCliCommandLink(actual: string) {
    this.trackCliCommand({
      command: 'link',
      value: actual,
    });
  }

  trackCliCommandList(actual: string) {
    this.trackCliCommand({
      command: 'list',
      value: actual,
    });
  }

  trackCliCommandLogin(actual: string) {
    this.trackCliCommand({
      command: 'login',
      value: actual,
    });
  }

  trackCliCommandLogout(actual: string) {
    this.trackCliCommand({
      command: 'logout',
      value: actual,
    });
  }

  trackCliCommandLogs(actual: string) {
    this.trackCliCommand({
      command: 'logs',
      value: actual,
    });
  }

  trackCliCommandProject(actual: string) {
    this.trackCliCommand({
      command: 'project',
      value: actual,
    });
  }

  trackCliCommandPromote(actual: string) {
    this.trackCliCommand({
      command: 'promote',
      value: actual,
    });
  }

  trackCliCommandPull(actual: string) {
    this.trackCliCommand({
      command: 'pull',
      value: actual,
    });
  }

  trackCliCommandRollback(actual: string) {
    this.trackCliCommand({
      command: 'rollback',
      value: actual,
    });
  }

  trackCliCommandRedeploy(actual: string) {
    this.trackCliCommand({
      command: 'redeploy',
      value: actual,
    });
  }

  trackCliCommandRemove(actual: string) {
    this.trackCliCommand({
      command: 'remove',
      value: actual,
    });
  }

  trackCliCommandTarget(actual: string) {
    this.trackCliCommand({
      command: 'target',
      value: actual,
    });
  }

  trackCliCommandTeams(actual: string) {
    this.trackCliCommand({
      command: 'teams',
      value: actual,
    });
  }

  trackCliCommandTelemetry(actual: string) {
    this.trackCliCommand({
      command: 'telemetry',
      value: actual,
    });
  }

  trackCliCommandWhoami(actual: string) {
    this.trackCliCommand({
      command: 'whoami',
      value: actual,
    });
  }

  trackCPUs() {
    super.trackCPUs();
  }

  trackArch() {
    super.trackArch();
  }

  trackPlatform(): void {
    super.trackPlatform();
  }

  trackCIVendorName() {
    this.trackCI(getContinuousIntegrationVendorName());
  }

  trackVersion(version: string | undefined) {
    super.trackVersion(version);
  }

  trackCliOptionCwd(cwd: string | undefined) {
    if (cwd) {
      this.trackCliOption({ option: 'cwd', value: this.redactedValue });
    }
  }

  trackCliOptionLocalConfig(localConfig: string | undefined) {
    if (localConfig) {
      this.trackCliOption({
        option: 'local-config',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionGlobalConfig(globalConfig: string | undefined) {
    if (globalConfig) {
      this.trackCliOption({
        option: 'global-config',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionScope(scope: string | undefined) {
    if (scope) {
      this.trackCliOption({
        option: 'scope',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionToken(token: string | undefined) {
    if (token) {
      this.trackCliOption({
        option: 'token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTeam(team: string | undefined) {
    if (team) {
      this.trackCliOption({
        option: 'team',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionApi(api: string | undefined) {
    if (api) {
      this.trackCliOption({
        option: 'api',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagDebug(debug: boolean | undefined) {
    if (debug) {
      this.trackCliFlag('debug');
    }
  }

  trackCliFlagNoColor(noColor: boolean | undefined) {
    if (noColor) {
      this.trackCliFlag('no-color');
    }
  }
}

interface Vendor {
  readonly name: string;
  readonly env: {
    readonly any: string[];
    readonly all: string[];
  };
  readonly eval_env: Record<string, string> | null;
}

export function getContinuousIntegrationVendorName() {
  for (const env of VENDORS) {
    if (env.eval_env) {
      for (const [name, expected_value] of Object.entries(env.eval_env)) {
        if (process.env[name] && process.env[name] === expected_value) {
          return env.name;
        }
      }
    } else if (env.env.any.length !== 0) {
      for (const env_var of env.env.any) {
        if (process.env[env_var]) {
          return env.name;
        }
      }
    } else if (env.env.all.length !== 0) {
      if (env.env.all.every(env_var => Boolean(process.env[env_var]))) {
        return env.name;
      }
    } else {
      return undefined;
    }
  }
}

// list copied from Turborepo
// https://github.com/vercel/turborepo/blob/663d3ffdc5b1a4a93353ed408c0b6a653fd89a9f/crates/turborepo-ci/src/vendors.rs#L33C13-L678C14
export const VENDORS: Vendor[] = [
  {
    name: 'Appcircle',
    env: {
      any: ['AC_APPCIRCLE'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'AppVeyor',
    env: {
      any: ['APPVEYOR'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'AWS CodeBuild',
    env: {
      any: ['CODEBUILD_BUILD_ARN'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Azure Pipelines',
    env: {
      any: ['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Bamboo',
    env: {
      any: ['bamboo_planKey'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Bitbucket Pipelines',
    env: {
      any: ['BITBUCKET_COMMIT'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Bitrise',
    env: {
      any: ['BITRISE_IO'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Buddy',
    env: {
      any: ['BUDDY_WORKSPACE_ID'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Buildkite',
    env: {
      any: ['BUILDKITE'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'CircleCI',
    env: {
      any: ['CIRCLECI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Cirrus CI',
    env: {
      any: ['CIRRUS_CI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Codefresh',
    env: {
      any: ['CF_BUILD_ID'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Codemagic',
    env: {
      any: ['CM_BUILD_ID'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Codeship',
    env: {
      any: [],
      all: [],
    },
    eval_env: { CI_NAME: 'codeship' },
  },
  {
    name: 'Drone',
    env: {
      any: ['DRONE'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'dsari',
    env: {
      any: ['DSARI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Expo Application Services',
    env: {
      any: ['EAS_BUILD'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'GitHub Actions',
    env: {
      any: ['GITHUB_ACTIONS'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'GitLab CI',
    env: {
      any: ['GITLAB_CI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'GoCD',
    env: {
      any: ['GO_PIPELINE_LABEL'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Google Cloud Build',
    env: {
      any: ['BUILDER_OUTPUT'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'LayerCI',
    env: {
      any: ['LAYERCI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Gerrit',
    env: {
      any: ['GERRIT_PROJECT'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Hudson',
    env: {
      any: ['HUDSON'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Jenkins',
    env: {
      any: [],
      all: ['JENKINS_URL', 'BUILD_ID'],
    },
    eval_env: null,
  },
  {
    name: 'Magnum CI',
    env: {
      any: ['MAGNUM'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Netlify CI',
    env: {
      any: ['NETLIFY'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Nevercode',
    env: {
      any: ['NEVERCODE'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'ReleaseHub',
    env: {
      any: ['RELEASE_BUILD_ID'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Render',
    env: {
      any: ['RENDER'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Sail CI',
    env: {
      any: ['SAILCI'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Screwdriver',
    env: {
      any: ['SCREWDRIVER'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Semaphore',
    env: {
      any: ['SEMAPHORE'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Shippable',
    env: {
      any: ['SHIPPABLE'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Solano CI',
    env: {
      any: ['TDDIUM'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Sourcehut',
    env: {
      any: [],
      all: [],
    },
    eval_env: { CI_NAME: 'sourcehut' },
  },
  {
    name: 'Strider CD',
    env: {
      any: ['STRIDER'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'TaskCluster',
    env: {
      any: ['TASK_ID', 'RUN_ID'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'TeamCity',
    env: {
      any: ['TEAMCITY_VERSION'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Travis CI',
    env: {
      any: ['TRAVIS'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Vercel',
    env: {
      any: ['NOW_BUILDER', 'VERCEL'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Visual Studio App Center',
    env: {
      any: ['APPCENTER'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Woodpecker',
    env: {
      any: [],
      all: [],
    },
    eval_env: { CI: 'woodpecker' },
  },
  {
    name: 'Xcode Cloud',
    env: {
      any: ['CI_XCODE_PROJECT'],
      all: [],
    },
    eval_env: null,
  },
  {
    name: 'Xcode Server',
    env: {
      any: ['XCS'],
      all: [],
    },
    eval_env: null,
  },
];
