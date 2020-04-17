//
import through2 from 'through2';
import jsonlines from 'jsonlines';
import { stringify } from 'querystring';

import noop from '../noop';

async function getEventsStream(now, idOrHost, options) {
  const response = await now.fetch(
    `/v2/now/deployments/${idOrHost}/events?${stringify({
      direction: options.direction,
      follow: options.follow ? '1' : '',
      format: options.format || 'lines',
      limit: options.limit,
      since: options.since,
      until: options.until,
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
