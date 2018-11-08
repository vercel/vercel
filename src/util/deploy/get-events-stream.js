// @flow
import through2 from 'through2';
import jsonlines from 'jsonlines';
import { stringify } from 'querystring';
import type { Readable } from 'stream';
import { Now } from '../types';
import noop from '../noop';

type Options = {
  direction: 'forward' | 'backwards',
  follow: boolean,
  format?: 'lines',
  instanceId?: string,
  limit?: number,
  query?: string,
  since?: number,
  types?: string[],
  until?: number
};

async function getEventsStream(
  now: Now,
  idOrHost: string,
  options: Options
): Promise<Readable> {
  const response = await now.fetch(
    `/v2/now/deployments/${idOrHost}/events?${stringify({
      direction: options.direction,
      follow: options.follow ? '1' : '',
      format: options.format || 'lines',
      instanceId: options.instanceId,
      limit: options.limit,
      q: options.query,
      since: options.since,
      types: (options.types || []).join(','),
      until: options.until
    })}`
  );
  const stream = response.readable ? await response.readable() : response.body;
  const pipeStream = stream.pipe(jsonlines.parse()).pipe(ignoreEmptyObjects);
  stream.on('error', noop);
  pipeStream.on('error', noop);
  return pipeStream;
}

// Since we will be receiving empty object from the stream, this transform will ignore them
const ignoreEmptyObjects = through2.obj(function(chunk, enc, cb) {
  if (Object.keys(chunk).length !== 0) {
    this.push(chunk);
  }
  cb();
});

export default getEventsStream;
