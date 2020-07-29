import fs from 'fs';
// @ts-ignore
import tar from 'tar-fs';
import { extract } from '../../_lib/examples/extract';
import { NowRequest, NowResponse } from '@vercel/node';
import { withApiHandler } from '../../_lib/util/with-api-handler';

const TMP_DIR = '/tmp';

function isDirectory(path: string) {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

function notFound(res: NowResponse, message: string) {
  return res.status(404).send({
    error: {
      code: 'not_found',
      message,
    },
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

export default withApiHandler(async function (
  req: NowRequest,
  res: NowResponse
) {
  const ext = '.tar.gz';
  const { segment = '' } = req.query;

  if (Array.isArray(segment) || !segment.endsWith(ext)) {
    return notFound(res, `Missing ${ext} suffix.`);
  }

  const example = segment.slice(0, -ext.length);

  await extract('https://github.com/vercel/vercel/archive/master.zip', TMP_DIR);
  const directory = `${TMP_DIR}/vercel-master/examples/${example}`;

  if (!isDirectory(directory)) {
    return notFound(res, `Example '${example}' was not found.`);
  }

  const stream = tar.pack(directory);
  return res.send(await streamToBuffer(stream));
});
