import { createReadStream } from 'fs';
import retry from 'async-retry';
import { DeploymentFile } from './utils/hashes';
import { fetch, API_FILES } from './utils';
import { DeploymentError } from '.';
import deploy, { Options } from './deploy';

export default async function* upload(
  files: Map<string, DeploymentFile>,
  options: Options
): AsyncIterableIterator<any> {
  const { token, teamId } = options;

  if (!files && !token && !teamId) {
    return;
  }

  let missingFiles = [];

  for await (const event of deploy(files, options)) {
    if (event.type === 'error') {
      if (event.payload.code === 'missing_files') {
        missingFiles = event.payload.missing;
      } else {
        return yield event;
      }
    } else {
      // If the deployment has succeeded here, don't continue
      if (event.type === 'ready') {
        return yield event;
      }

      yield event;
    }
  }

  const shas = missingFiles;

  yield { type: 'file_count', payload: { total: files, missing: shas } };

  const uploadList: { [key: string]: Promise<any> } = {};

  shas.map((sha: string): void => {
    uploadList[sha] = retry(
      async (bail): Promise<any> => {
        const file = files.get(sha);

        if (!file) {
          return bail(new Error(`File ${sha} is undefined`));
        }

        const fPath = file.names[0];
        const stream = createReadStream(fPath);
        const { data } = file;

        const fstreamPush = stream.push;

        let uploadedSoFar = 0;

        stream.push = (chunk: any): boolean => {
          // If we're about to push the last chunk, then don't do it here
          // But instead, we'll "hang" the progress bar and do it on 200
          if (chunk && uploadedSoFar + chunk.length < data.length) {
            uploadedSoFar += chunk.length;
            // semaphore.release()
          }

          return fstreamPush.call(stream, chunk);
        };

        // while (uploadedSoFar !== file.data.length) {
        //   await semaphore.acquire()

        //   lastEvent = uploadedSoFar;
        //   yield uploadedSoFar;
        // }

        let err;
        let result;

        try {
          const res = await fetch(API_FILES, token, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-now-digest': sha,
              'x-now-length': data.length,
            },
            body: stream,
            teamId,
          });

          if (res.status === 200) {
            result = {
              type: 'file-uploaded',
              payload: { sha, file },
            };
          } else if (res.status > 200 && res.status < 500) {
            // If something is wrong with our request, we don't retry
            const { error } = await res.json();

            err = new DeploymentError(error);
          } else {
            // If something is wrong with the server, we retry
            const { error } = await res.json();

            throw new DeploymentError(error);
          }
        } catch (e) {
          err = new Error(e);
        } finally {
          stream.close();
          stream.destroy();
        }

        if (err) {
          return bail(err);
        }

        return result;
      },
      {
        retries: 6,
        randomize: true,
      }
    );
  });

  while (Object.keys(uploadList).length > 0) {
    try {
      const event = await Promise.race(
        Object.keys(uploadList).map((key): Promise<any> => uploadList[key])
      );

      delete uploadList[event.payload.sha];
      yield event;
    } catch (e) {
      return yield { type: 'error', payload: e };
    }
  }

  yield { type: 'all-files-uploaded', payload: files };

  try {
    for await (const event of deploy(files, options)) {
      if (event.type === 'ready') {
        return yield event;
      }

      yield event;
    }
  } catch (e) {
    yield { type: 'error', payload: e };
  }
}
