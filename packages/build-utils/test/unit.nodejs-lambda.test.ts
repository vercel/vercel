import { NodejsLambda, FileBlob } from '../src';

describe('Test `NodejsLambda`', () => {
  it.skip('should create an instance', () => {
    const helloSrc = 'module.exports = (req, res) => res.end("hi");';
    const lambda = new NodejsLambda({
      files: {
        'api/hello.js': new FileBlob({ data: helloSrc }),
      },
      handler: 'api/hello.js',
      runtime: 'node14.x',
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: false,
    });
    expect(lambda.handler).toEqual('api/hello.js');
    expect(lambda.runtime).toEqual('node14.x');
    expect(lambda.shouldAddHelpers).toEqual(true);
    expect(lambda.shouldAddSourcemapSupport).toEqual(false);
    expect(lambda.awsLambdaHandler).toBeUndefined();
  });
});
