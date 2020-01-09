import fs from 'fs';
// @ts-ignore
import tar from 'tar-fs';
import { extract } from '../../_lib/examples/extract';
import { NowRequest, NowResponse } from '@now/node';
import { withApiHandler } from '../../_lib/util/with-api-handler';

const TMP_DIR = '/tmp';

function isDirectory(path: string) {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

function notFound(res: NowResponse, message: string) {
  return res.status(404).send({
    error: {
      code: 'not_found',
      message
    }
  });
}

function streamToBuffer(stream: any) {
  return new Promise((resolve, reject) => {
    const buffers: any[] = [];
    stream.on('error', (err: any) => {
      reject(err);
    });
    stream.on('data', (b: any) => {
      buffers.push(b);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

export default withApiHandler(async function(req: NowRequest, res: NowResponse) {
  const ext = '.tar.gz';
  const { segment = '' } = req.query;

  if (Array.isArray(segment) || !segment.endsWith(ext)) {
    return notFound(res, `Missing ${ext} suffix.`);
  }

  const example = segment.slice(0, -ext.length);
  let directory;

  if (Number(req.query.version) === 1) {
    // The old cli is pinned to a specific commit hash
    await extract('https://github.com/zeit/now-examples/archive/7c7b27e49b8b17d0d3f0e1604dc74fd005cd69e3.zip', TMP_DIR);
    directory = `${TMP_DIR}/now-examples-7c7b27e49b8b17d0d3f0e1604dc74fd005cd69e3/${example}`;
  } else {
    await extract('https://github.com/zeit/now-examples/archive/master.zip', TMP_DIR);
    directory = `${TMP_DIR}/now-examples-master/${example}`;

    if (!isDirectory(directory)) {
      // Use `now` instead of `now-examples` if the searched example does not exist
      await extract('https://github.com/zeit/now/archive/master.zip', TMP_DIR);
      directory = `${TMP_DIR}/now-master/examples/${example}`;
    }
  }

  if (!isDirectory(directory)) {
    return notFound(res, `Example '${example}' was not found.`);
  }

  const stream = tar.pack(directory);
  return res.send(await streamToBuffer(stream));
});
