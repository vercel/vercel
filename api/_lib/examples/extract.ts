/**
 * Download zip and extract to target directory
 */

import got from 'got';
import unzip from 'unzip-stream';

export async function extract(sourceUrl: string, targetPath: string) {
  return new Promise((resolve, reject) => {
    got
      .stream(sourceUrl)
      .pipe(unzip.Extract({ path: targetPath }))
      .on('close', resolve)
      .on('error', err => {
        reject(new Error('Failed extracting from github.'));
      });
  });
}
