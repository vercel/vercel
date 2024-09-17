import fs from 'fs';
// @ts-ignore
import tar from 'tar-fs';
import { extract } from '../../_lib/examples/extract';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { withApiHandler } from '../../_lib/util/with-api-handler';

const TMP_DIR = '/tmp';

function isDirectory(path: string) {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

function notFound(res: VercelResponse, message: string) {
  return res.status(404).send({
    error: {
      code: 'not_found',
      message,
    },
  });
}

function streamToBuffer(stream: any): Promise<Buffer> {
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
  req: VercelRequest,
  res: VercelResponse
) {
  const ext = '.tar.gz';
  const { segment = '' } = req.query;

  if (Array.isArray(segment) || !segment.endsWith(ext)) {
    return notFound(res, `Missing ${ext} suffix.`);
  }
  console.log({ segment });

  const example = segment.slice(0, -ext.length);
  console.log({ example });

  console.log(`Extracting ${example} example...`);
  await extract('https://github.com/vercel/vercel/archive/main.zip', TMP_DIR);
  console.log(`Done extracting ${example} example.`);

  const directory = `${TMP_DIR}/vercel-main/examples/${example}`;
  console.log({ directory });

  if (!isDirectory(directory)) {
    return notFound(res, `Example '${example}' was not found.`);
  }

  const stream = tar.pack(directory);
  console.log(`Packing tarball...`);
  const buf = await streamToBuffer(stream);
  console.log(`Done packing tarball (${buf.length} bytes).`);

  return res.send(buf);
});
