import frameworkList from '@vercel/frameworks';
import { detectFrameworkRecord } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectFrameworkRecord', () => {
  it('Detect a framework record', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: '9.0.0',
          gatsby: '4.18.0',
        },
      }),
    });

    const frameworkRecord = await detectFrameworkRecord({ fs, frameworkList });
    if (!frameworkRecord) {
      throw new Error(
        '`frameworkRecord` was not detected, expected "nextjs" frameworks object'
      );
    }
    expect(frameworkRecord.slug).toBe('nextjs');
    expect(frameworkRecord.name).toBe('Next.js');
  });
});
