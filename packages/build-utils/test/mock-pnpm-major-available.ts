import fs from 'fs-extra';
import { vi } from 'vitest';

const realExistsSync = fs.existsSync.bind(fs);

export function mockPnpmMajorAvailable(
  majorOrMap: number | Record<number, boolean>,
  available?: boolean
) {
  const map: Record<number, boolean> =
    typeof majorOrMap === 'number'
      ? { [majorOrMap]: available as boolean }
      : majorOrMap;
  return vi.spyOn(fs, 'existsSync').mockImplementation(p => {
    const key = String(p);
    for (const [major, isAvailable] of Object.entries(map)) {
      if (key === `/pnpm${major}`) {
        return isAvailable;
      }
    }
    return realExistsSync(p);
  });
}
