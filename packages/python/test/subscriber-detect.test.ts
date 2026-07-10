import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  getPyprojectSubscribers,
  resolveSubscriberSubscriptions,
  type Subscriber,
} from '../src/subscribers';
import { findUvInPath, UvRunner } from '../src/uv';
import { getDevSidecars } from '../src';

describe('dynamic subscriber topic detection (integration)', () => {
  let workDir: string;
  let venvPath: string;
  let uv: UvRunner;

  beforeAll(async () => {
    const uvPath = findUvInPath();
    if (!uvPath) {
      throw new Error('uv binary is required to run these tests');
    }
    uv = new UvRunner(uvPath);
    // Detection runs through `uv run --active`, which resolves the
    // interpreter from a venv; share one bare venv across all tests.
    venvPath = path.join(
      tmpdir(),
      `subscriber-detect-venv-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const args = ['venv', venvPath];
    if (process.env.PYTHON_BIN) {
      args.push('--python', process.env.PYTHON_BIN);
    }
    await execa(uvPath, args);
  });

  afterAll(async () => {
    if (venvPath) {
      await fs.remove(venvPath);
    }
  });

  afterEach(async () => {
    if (workDir) {
      await fs.remove(workDir);
    }
  });

  async function setupWorkDir(files: Record<string, string>): Promise<string> {
    workDir = path.join(
      tmpdir(),
      `subscriber-detect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdirp(workDir);
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(workDir, filePath);
      await fs.mkdirp(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
    }
    return workDir;
  }

  function pyprojectToml(subscriberLines: string[]): string {
    return [
      '[project]',
      'name = "x"',
      'version = "0.0.1"',
      '',
      '[[tool.vercel.subscribers]]',
      ...subscriberLines,
      '',
    ].join('\n');
  }

  async function getSubscriber(): Promise<Subscriber> {
    const subscribers = await getPyprojectSubscribers(workDir);
    expect(subscribers).toHaveLength(1);
    return subscribers[0];
  }

  function resolve(subscriber: Subscriber) {
    return resolveSubscriberSubscriptions({
      subscriber,
      uv,
      venvPath,
      env: { ...process.env, PYTHONPATH: workDir },
      workPath: workDir,
    });
  }

  it('detects a single topic without trigger config', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "default"}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    const subscriber = await getSubscriber();
    expect(subscriber.topics).toBeUndefined();
    await expect(resolve(subscriber)).resolves.toEqual([
      { topic: 'default', trigger: {} },
    ]);
  });

  it('detects multiple topics with per-topic trigger config', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [
            {"topic": "short", "retry_after_seconds": 10},
            {
                "topic": "long",
                "retry_after_seconds": 300,
                "initial_delay_seconds": 0,
                "max_concurrency": 1,
                "max_deliveries": 5,
            },
        ]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'short', trigger: { retryAfterSeconds: 10 } },
      {
        topic: 'long',
        trigger: {
          retryAfterSeconds: 300,
          initialDelaySeconds: 0,
          maxConcurrency: 1,
          maxDeliveries: 5,
        },
      },
    ]);
  });

  it('applies pyproject trigger defaults and lets code override per topic', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [
            {"topic": "emails", "retry_after_seconds": 60},
            {"topic": "reports"},
        ]

app = Worker()
`,
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'max_deliveries = 3',
        'retry_after_seconds = 10',
      ]),
    });

    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'emails', trigger: { maxDeliveries: 3, retryAfterSeconds: 60 } },
      {
        topic: 'reports',
        trigger: { maxDeliveries: 3, retryAfterSeconds: 10 },
      },
    ]);
  });

  it('trusts explicit topics when the entrypoint does not implement get_queue_subscriptions', async () => {
    await setupWorkDir({
      'worker.py': 'app = object()\n',
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["celery"]',
        'retry_after_seconds = 10',
      ]),
    });

    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'celery', trigger: { retryAfterSeconds: 10 } },
    ]);
  });

  it('validates explicit topics as a subset of code-declared subscriptions', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [
            {"topic": "emails", "retry_after_seconds": 60},
            {"topic": "reports"},
        ]

app = Worker()
`,
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["emails"]',
        'max_deliveries = 3',
      ]),
    });

    // The explicit topic selects a subset and adopts the matched
    // subscription's trigger config over the pyproject defaults.
    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'emails', trigger: { maxDeliveries: 3, retryAfterSeconds: 60 } },
    ]);
  });

  it('rejects explicit topics that the code does not declare', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "emails"}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["emails", "orders"]',
      ]),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /subscriber "worker_app" declares topic "orders" but "worker\.app\.get_queue_subscriptions\(\)" does not declare it\. Declared topics: "emails"/
    );
  });

  it('matches explicit topics against code-declared wildcard patterns', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [
            {"topic": "users-*", "retry_after_seconds": 30},
            {"topic": "users-signup", "retry_after_seconds": 60},
        ]

app = Worker()
`,
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["users-signup", "users-deleted", "users-vip-*"]',
      ]),
    });

    // Exact match beats the prefix pattern; unmatched concrete topics fall
    // back to the pattern's trigger config; a narrower explicit pattern is a
    // valid subset of a declared pattern.
    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'users-signup', trigger: { retryAfterSeconds: 60 } },
      { topic: 'users-deleted', trigger: { retryAfterSeconds: 30 } },
      { topic: 'users-vip-*', trigger: { retryAfterSeconds: 30 } },
    ]);
  });

  it('fails when get_queue_subscriptions raises even with explicit topics', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        raise RuntimeError("boom")

app = Worker()
`,
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["celery"]',
      ]),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /error calling "worker\.app\.get_queue_subscriptions\(\)": boom/
    );
  });

  it('fails when the detection subprocess cannot be launched', async () => {
    await setupWorkDir({
      'worker.py': 'app = object()\n',
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["celery"]',
      ]),
    });

    const subscriber = await getSubscriber();
    await expect(
      resolveSubscriberSubscriptions({
        subscriber,
        uv: new UvRunner('/nonexistent/uv'),
        venvPath,
        env: process.env,
        workPath: workDir,
      })
    ).rejects.toThrow(/could not detect queue subscriptions/);
  });

  it('supports entrypoints that derive topics from framework config', async () => {
    // Documents the shape SDK adapters (e.g. Celery) will implement: the
    // wrapper derives topics from the framework's own routing config.
    await setupWorkDir({
      'worker.py': `
CONF = {
    "task_default_queue": "default",
    "task_routes": {
        "tasks.add": {"queue": "math"},
        "tasks.send": {"queue": "emails"},
    },
}

class CeleryShim:
    def __init__(self, conf):
        self.conf = conf

    def get_queue_subscriptions(self):
        topics = {self.conf["task_default_queue"]}
        for route in self.conf["task_routes"].values():
            topics.add(route["queue"])
        return [{"topic": topic} for topic in sorted(topics)]

app = CeleryShim(CONF)
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'default', trigger: {} },
      { topic: 'emails', trigger: {} },
      { topic: 'math', trigger: {} },
    ]);
  });

  it('tolerates user code printing to stdout during import and detection', async () => {
    await setupWorkDir({
      'worker.py': `
print("import side effect")

class Worker:
    def get_queue_subscriptions(self):
        print("detection side effect")
        return [{"topic": "default"}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'default', trigger: {} },
    ]);
  });

  it('fails when the entrypoint object has no get_queue_subscriptions method', async () => {
    await setupWorkDir({
      'worker.py': 'app = object()\n',
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /"worker\.app" has no "get_queue_subscriptions" method/
    );
  });

  it('fails when get_queue_subscriptions raises', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        raise RuntimeError("boom")

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /error calling "worker\.app\.get_queue_subscriptions\(\)": boom/
    );
  });

  it('fails when the module cannot be imported', async () => {
    await setupWorkDir({
      'worker.py': 'import does_not_exist\napp = object()\n',
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /could not import module "worker"/
    );
  });

  it('fails when detection returns no subscriptions', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return []

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /subscriber "worker_app" returned no subscriptions/
    );
  });

  it('fails on non-mapping subscription entries', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return ["default"]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /each subscription must be a mapping with a "topic" key/
    );
  });

  it('fails on a missing or empty topic', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"retry_after_seconds": 10}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /subscription "topic" must be a non-empty string/
    );
  });

  it('derives wildcard pattern topics', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "users-*", "retry_after_seconds": 30}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).resolves.toEqual([
      { topic: 'users-*', trigger: { retryAfterSeconds: 30 } },
    ]);
  });

  it('fails on duplicate topics', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "emails"}, {"topic": "emails"}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /duplicate subscription topic "emails"/
    );
  });

  it('fails on unrecognized subscription fields', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "emails", "consumer": "custom"}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /unrecognized field\(s\): 'consumer'/
    );
  });

  it('fails on non-numeric trigger values', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "emails", "retry_after_seconds": True}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /field "retry_after_seconds" must be a number/
    );
  });

  it('fails on out-of-range trigger values', async () => {
    await setupWorkDir({
      'worker.py': `
class Worker:
    def get_queue_subscriptions(self):
        return [{"topic": "emails", "retry_after_seconds": -1}]

app = Worker()
`,
      'pyproject.toml': pyprojectToml(['entrypoint = "worker:app"']),
    });

    await expect(resolve(await getSubscriber())).rejects.toThrow(
      /subscriber "worker_app" subscription "emails" field "retry_after_seconds" must be greater than 0/
    );
  });

  it('subscribes dynamic dev sidecars to every topic without importing user code', async () => {
    // The broken import proves dev startup never spawns Python: the worker's
    // own SDK routing is the dispatcher in dev, so the sidecar subscribes to
    // "*" and the build remains the enforcement point for detection.
    await setupWorkDir({
      'worker.py': 'import does_not_exist\napp = object()\n',
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'retry_after_seconds = 10',
      ]),
    });

    const sidecars = await getDevSidecars({
      workPath: workDir,
      build: {
        use: '@vercel/python',
        src: '<detect>',
        config: { framework: 'fastapi' },
      },
    });

    expect(sidecars).toHaveLength(1);
    expect(sidecars[0].topics).toEqual([{ topic: '*', retryAfterSeconds: 10 }]);
  });

  it('passes explicit topics to dev sidecars without verification', async () => {
    await setupWorkDir({
      'worker.py': 'import does_not_exist\napp = object()\n',
      'pyproject.toml': pyprojectToml([
        'entrypoint = "worker:app"',
        'topics = ["celery"]',
        'retry_after_seconds = 10',
      ]),
    });

    const sidecars = await getDevSidecars({
      workPath: workDir,
      build: {
        use: '@vercel/python',
        src: '<detect>',
        config: { framework: 'fastapi' },
      },
    });

    expect(sidecars).toHaveLength(1);
    expect(sidecars[0].topics).toEqual([
      { topic: 'celery', retryAfterSeconds: 10 },
    ]);
  });
});
