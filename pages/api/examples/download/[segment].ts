import fs from 'fs';
import tar from 'tar-fs';
import { NextApiRequest, NextApiResponse } from 'next';
import { extract } from '../../../../lib/examples/extract';
import { withApiHandler } from '../../../../lib/util/with-api-handler';

const TMP_DIR = '/tmp';

function isDirectory(path: string) {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

function notFound(res, message) {
  return res.status(404).send({
    error: {
      code: 'not_found',
      message
    }
  });
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    stream.on('error', err => {
      reject(err);
    });
    stream.on('data', b => {
      buffers.push(b);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

export default withApiHandler(async function(req: NextApiRequest, res: NextApiResponse) {
  const ext = '.tar.gz';
  const { segment = '' } = req.query;

  if (!segment.endsWith(ext)) {
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
  }

  if (!isDirectory(directory)) {
    return notFound(res, `Example '${example}' was not found.`);
  }

  const stream = tar.pack(directory);
  return res.send(await streamToBuffer(stream));
});
