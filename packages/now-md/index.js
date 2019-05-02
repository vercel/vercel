const { FileBlob, shouldServe } = require('@now/build-utils'); // eslint-disable-line import/no-extraneous-dependencies
const unified = require('unified');
const unifiedStream = require('unified-stream');
const markdown = require('remark-parse');
const remark2rehype = require('remark-rehype');
const doc = require('rehype-document');
const format = require('rehype-format');
const html = require('rehype-stringify');

exports.analyze = ({ files, entrypoint }) => files[entrypoint].digest;

exports.build = async ({ files, entrypoint, config }) => {
  const stream = files[entrypoint].toStream();
  const options = config || {};

  const title = options.title || null;
  const language = options.language || 'en';
  const meta = options.meta || null;
  const css = options.css || null;

  const processor = unified()
    .use(markdown)
    .use(remark2rehype)
    .use(doc, {
      title,
      language,
      meta,
      css,
    })
    .use(format)
    .use(html);

  const result = await FileBlob.fromStream({
    stream: stream.pipe(unifiedStream(processor)),
  });

  const replacedEntrypoint = entrypoint.replace(/\.[^.]+$/, '.html');

  return { [replacedEntrypoint]: result };
};

exports.shouldServe = shouldServe;
