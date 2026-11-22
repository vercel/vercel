import { execFileSync } from 'node:child_process';

// The dispatcher is Unix-only, and `go test` fails when no package matches.
if (process.platform !== 'win32') {
  execFileSync(
    process.env.GO_BIN || 'go',
    ['-C', 'schedules-command-dispatcher', 'test', './...'],
    { stdio: 'inherit' }
  );
}
