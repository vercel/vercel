/**
 * Credit: https://github.com/lambci/node-custom-lambda/blob/master/v10.x/bootstrap.js
 */
import * as http from 'http';
import { promisify } from 'util';
import { RequestOptions, IncomingHttpHeaders } from 'http';

interface FetchOpts extends RequestOptions {
  body?: string;
}

interface LambdaEnvironmentVariables {
  AWS_LAMBDA_FUNCTION_NAME: string;
  AWS_LAMBDA_FUNCTION_VERSION: string;
  AWS_LAMBDA_FUNCTION_MEMORY_SIZE: string;
  AWS_LAMBDA_LOG_GROUP_NAME: string;
  AWS_LAMBDA_LOG_STREAM_NAME: string;
  LAMBDA_TASK_ROOT: string;
  _HANDLER: string;
  HOST: string;
  PORT: string;
}

interface LambdaEvent {}

interface LambdaContext {
  callbackWaitsForEmptyEventLoop: boolean;
  logGroupName: string;
  logStreamName: string;
  functionName: string;
  memoryLimitInMB: string;
  functionVersion: string;
  invokeid: string;
  awsRequestId: string;
  invokedFunctionArn?: string;
  getRemainingTimeInMillis(): number;
  clientContext?: object;
  identity?: string | object;
}

interface HttpResult {
  statusCode?: number;
  headers: IncomingHttpHeaders;
  body: string;
}

type HandlerFunction = (
  event: LambdaEvent,
  context?: LambdaContext
) => Promise<object | undefined>;

start();

async function start(): Promise<void> {
  delete process.env.SHLVL;
  const RUNTIME = '/2018-06-01/runtime';
  const env = getExpectedEnvVars();

  let handler: HandlerFunction;
  try {
    handler = getHandler(env);
  } catch (err) {
    await postError(`${RUNTIME}/init/error`, err, env);
    return process.exit(1);
  }
  try {
    while (true) {
      const { event, context } = await nextInvocation(
        `${RUNTIME}/invocation/next`,
        env
      );
      const { awsRequestId } = context;
      let result: object | undefined;
      try {
        result = await handler(event, context);
      } catch (err) {
        await postError(
          `${RUNTIME}/invocation/${awsRequestId}/error`,
          err,
          env
        );
        continue;
      }
      await invokeResponse(
        `${RUNTIME}/invocation/${awsRequestId}/response`,
        result,
        env
      );
    }
  } catch (err) {
    console.error(err);
    return process.exit(1);
  }
}

async function nextInvocation(path: string, env: LambdaEnvironmentVariables) {
  const res = await fetch({ path }, env);

  if (res.statusCode !== 200) {
    throw new Error(
      `Unexpected /invocation/next response: ${JSON.stringify(res)}`
    );
  }

  const traceId = res.headers['lambda-runtime-trace-id'] as string;

  if (traceId) {
    process.env._X_AMZN_TRACE_ID = traceId;
  } else {
    delete process.env._X_AMZN_TRACE_ID;
  }

  const deadlineMs = Number(res.headers['lambda-runtime-deadline-ms']);
  const awsRequestId = res.headers['lambda-runtime-aws-request-id'] as string;
  const invokedFunctionArn = res.headers[
    'lambda-runtime-invoked-function-arn'
  ] as string;
  const clientContext = res.headers['lambda-runtime-client-context'] as string;
  const identity = res.headers['lambda-runtime-cognito-identity'] as string;

  const context: LambdaContext = {
    callbackWaitsForEmptyEventLoop: false,
    logGroupName: env.AWS_LAMBDA_LOG_GROUP_NAME,
    logStreamName: env.AWS_LAMBDA_LOG_STREAM_NAME,
    functionName: env.AWS_LAMBDA_FUNCTION_NAME,
    memoryLimitInMB: env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    functionVersion: env.AWS_LAMBDA_FUNCTION_VERSION,
    invokeid: awsRequestId,
    awsRequestId,
    invokedFunctionArn,
    getRemainingTimeInMillis: () => deadlineMs - Date.now(),
  };

  if (clientContext) {
    context.clientContext = JSON.parse(clientContext);
  }

  if (identity) {
    context.identity = JSON.parse(identity);
  }

  const event = JSON.parse(res.body);

  return { event, context };
}

function getExpectedEnvVars(): LambdaEnvironmentVariables {
  const {
    AWS_LAMBDA_FUNCTION_NAME,
    AWS_LAMBDA_FUNCTION_VERSION,
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    AWS_LAMBDA_LOG_GROUP_NAME,
    AWS_LAMBDA_LOG_STREAM_NAME,
    LAMBDA_TASK_ROOT,
    _HANDLER,
    AWS_LAMBDA_RUNTIME_API,
  } = process.env;

  if (!AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error('Env var not found: ' + AWS_LAMBDA_FUNCTION_NAME);
  }

  if (!AWS_LAMBDA_FUNCTION_VERSION) {
    throw new Error('Env var not found: ' + AWS_LAMBDA_FUNCTION_VERSION);
  }
  if (!AWS_LAMBDA_FUNCTION_MEMORY_SIZE) {
    throw new Error('Env var not found: ' + AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  }
  if (!AWS_LAMBDA_LOG_GROUP_NAME) {
    throw new Error('Env var not found: ' + AWS_LAMBDA_LOG_GROUP_NAME);
  }
  if (!AWS_LAMBDA_LOG_STREAM_NAME) {
    throw new Error('Env var not found: ' + AWS_LAMBDA_LOG_STREAM_NAME);
  }
  if (!LAMBDA_TASK_ROOT) {
    throw new Error('Env var not found: ' + LAMBDA_TASK_ROOT);
  }
  if (!_HANDLER) {
    throw new Error('Env var not found: ' + _HANDLER);
  }
  if (!AWS_LAMBDA_RUNTIME_API) {
    throw new Error('Env var not found: ' + AWS_LAMBDA_RUNTIME_API);
  }

  const [HOST, PORT] = AWS_LAMBDA_RUNTIME_API.split(':');

  return {
    AWS_LAMBDA_FUNCTION_NAME,
    AWS_LAMBDA_FUNCTION_VERSION,
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    AWS_LAMBDA_LOG_GROUP_NAME,
    AWS_LAMBDA_LOG_STREAM_NAME,
    LAMBDA_TASK_ROOT,
    _HANDLER,
    HOST,
    PORT,
  };
}

async function invokeResponse(
  path: string,
  result: object | undefined,
  env: LambdaEnvironmentVariables
) {
  const res = await fetch(
    {
      method: 'POST',
      path,
      body: JSON.stringify(result),
    },
    env
  );
  if (res.statusCode !== 202) {
    throw new Error(
      `Unexpected /invocation/response response: ${JSON.stringify(res)}`
    );
  }
}

async function postError(
  path: string,
  err: Error,
  env: LambdaEnvironmentVariables
) {
  const lambdaErr = toLambdaErr(err);
  const res = await fetch(
    {
      method: 'POST',
      path,
      headers: {
        'Content-Type': 'application/json',
        'Lambda-Runtime-Function-Error-Type': lambdaErr.errorType,
      },
      body: JSON.stringify(lambdaErr),
    },
    env
  );
  if (res.statusCode !== 202) {
    throw new Error(`Unexpected ${path} response: ${JSON.stringify(res)}`);
  }
}

function getHandler({
  _HANDLER,
  LAMBDA_TASK_ROOT,
}: LambdaEnvironmentVariables): HandlerFunction {
  const appParts = _HANDLER.split('.');

  if (appParts.length !== 2) {
    throw new Error(`Bad handler ${_HANDLER}`);
  }

  const [modulePath, handlerName] = appParts;

  let app: any;
  try {
    app = require(`${LAMBDA_TASK_ROOT}/${modulePath}`);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      throw new Error(`Unable to import module '${modulePath}'`);
    }
    throw e;
  }

  const userHandler = app[handlerName];

  if (userHandler == null) {
    throw new Error(
      `Handler '${handlerName}' missing on module '${modulePath}'`
    );
  } else if (typeof userHandler !== 'function') {
    throw new Error(
      `Handler '${handlerName}' from '${modulePath}' is not a function`
    );
  }

  return userHandler.length >= 3 ? promisify(userHandler) : userHandler;
}

async function fetch(
  options: FetchOpts,
  { HOST, PORT }: LambdaEnvironmentVariables
): Promise<HttpResult> {
  options.host = HOST;
  options.port = PORT;

  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      const bufs: Buffer[] = [];
      res.on('data', data => bufs.push(data));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(bufs).toString('utf8'),
        })
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

function toLambdaErr(err: Error) {
  const { name, message, stack } = err;
  return {
    errorType: name,
    errorMessage: message,
    stackTrace: (stack || '').split('\n').slice(1),
  };
}
