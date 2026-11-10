import _treeKill from 'tree-kill';

export function treeKill(
  pid: number,
  signal: string | number = 'SIGTERM'
): Promise<void> {
  return new Promise((resolve, reject) => {
    _treeKill(pid, signal, err => {
      if (err) reject(err);
      else resolve();
    });
  });
}
