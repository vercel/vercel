import fetch, { Headers } from 'node-fetch';
import pkg from '../../../package.json';
import Client from '../client';
import ua from '../ua';
import { ProjectLinkAndSettings } from '../projects/project-settings';

const HOST = 'https://vercel.com/api';

class Run {
  id: string;
  url: string;
  startTime = Date.now();

  constructor({ id, url }: { id: string; url: string }) {
    this.id = id;
    this.url = url;
  }
}

/*
Ordering of requests:
1. Create run (POST)
2. Create tasks (POST)
3. Finish run (PATCH)

*/

export default class Spaces {
  version: string = 'v0';
  type: string = 'VERCEL-CLI';
  spaceId: string;
  client: Client;
  run: Run | undefined;

  constructor({ spaceId, client }: { spaceId?: string; client: Client }) {
    // TODO: remove default spaceId (vercel-site)
    this.spaceId = spaceId || 'space_FwOT2idkmZ5PIDvgK5xY3YpD';
    this.client = client;
  }

  private runsEndpoint({ runId }: { runId?: string } = {}) {
    if (runId) {
      return `spaces/${this.spaceId}/runs/${runId}`;
    }
    return `spaces/${this.spaceId}/runs`;
  }

  private tasksEndpoint({ runId }: { runId: string }) {
    return `spaces/${this.spaceId}/runs/${runId}/tasks`;
  }

  private async gitMetaData() {
    return {
      gitBranch: 'TODO',
      gitSha: 'TODO',
    };
  }

  private async fetch({
    method,
    body,
    endpoint,
  }: {
    method: 'POST' | 'PATCH';
    body: string;
    endpoint: string;
  }) {
    const url = new URL(`${HOST}/${this.version}/${endpoint}`);
    if (this.client.config.currentTeam) {
      url.searchParams.set('teamId', this.client.config.currentTeam);
    }

    const headers = new Headers();
    headers.set('user-agent', ua);
    if (this.client.authConfig.token) {
      headers.set('authorization', `Bearer ${this.client.authConfig.token}`);
    }

    return fetch(url, {
      method,
      body,
      headers,
    });
  }

  async finishRun({ exitCode }: { exitCode: number }) {
    if (!this.spaceId) {
      return;
    }

    if (!this.run) {
      return;
    }

    try {
      // patch with node-fetch
      await this.fetch({
        endpoint: this.runsEndpoint({ runId: this.run.id }),
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          endTime: Date.now(),
          exitCode,
        }),
      });
      console.log(`✅ Run saved to ${this.run.url}`);
    } catch (err) {
      console.error(err);
    } finally {
      // reset the run
      this.run = undefined;
    }
  }

  async createRun({ project }: { project: ProjectLinkAndSettings }) {
    if (!this.spaceId) {
      return;
    }
    if (this.run) {
      console.error(
        `Existing run in progress, cannot start a new run before finishing the current run.`
      );
      return;
    }

    const data = {
      status: 'running',
      startTime: Date.now(),
      type: this.type,
      context: 'LOCAL',
      client: {
        id: 'vercel-cli',
        name: 'Vercel CLI',
        version: pkg.version,
      },
      meta: JSON.stringify({ project }),
      repositoryPath: 'TODO',
      command: project.settings.buildCommand ?? '',
      ...this.gitMetaData(),
    };

    try {
      const res = await this.fetch({
        endpoint: this.runsEndpoint(),
        method: 'POST',
        body: JSON.stringify(data),
      });

      const json = await res.json();
      console.log(`Created run: ${json.url}`);

      // track the run
      this.run = new Run({ id: json.id, url: json.url });
    } catch (err) {
      console.error(err);
    }
  }

  async createTask(data: {
    key: string;
    name: string;
    workspace: string;
    log: string;
  }) {
    if (!this.spaceId) {
      return;
    }
    if (!this.run) {
      console.error(
        `No run in progress, must start a new run before creating tasks.`
      );
      return;
    }

    try {
      const res = await this.fetch({
        endpoint: this.tasksEndpoint({ runId: this.run.id }),
        method: 'POST',
        body: JSON.stringify(data),
      });

      const json = await res.json();
      console.log(`Added task: ${json}`);
    } catch (err) {
      console.error(err);
    }
  }
}
