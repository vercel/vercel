import { describe, expect, it } from 'vitest';
import { deserializeLambda } from '../src/deserialize/deserialize-lambda';
import type {
  SerializedLambda,
  SerializedNodejsLambda,
} from '../src/deserialize/serialized-types';
import { Lambda } from '../src/lambda';
import { NodejsLambda } from '../src/nodejs-lambda';

interface ExternalConfig {
  awsAccountId: string;
  digest: string;
  size: number;
}

class ExternalLambda extends Lambda {
  external?: ExternalConfig;

  constructor({
    external,
    ...props
  }: ConstructorParameters<typeof Lambda>[0] & {
    external?: ExternalConfig;
  }) {
    super(props);
    this.external = external;
  }
}

class ExternalNodejsLambda extends NodejsLambda {
  external?: ExternalConfig;

  constructor({
    external,
    ...props
  }: ConstructorParameters<typeof NodejsLambda>[0] & {
    external?: ExternalConfig;
  }) {
    super(props);
    this.external = external;
  }
}

describe('deserializeLambda', () => {
  const external: ExternalConfig = {
    awsAccountId: 'aws-account-id',
    digest: 'digest',
    size: 123,
  };

  it('preserves subclass fields for LambdaClass', async () => {
    const config: SerializedLambda<ExternalLambda> = {
      handler: 'index.handler',
      runtime: 'nodejs20.x',
      external,
    };

    const lambda = await deserializeLambda({}, config, '', new Map(), {
      LambdaClass: ExternalLambda,
      NodejsLambdaClass: ExternalNodejsLambda,
    });

    expect(lambda).toBeInstanceOf(ExternalLambda);
    expect((lambda as ExternalLambda).external).toEqual(external);
  });

  it('preserves subclass fields for NodejsLambdaClass', async () => {
    const config: SerializedNodejsLambda<ExternalNodejsLambda> = {
      handler: 'index.handler',
      runtime: 'nodejs20.x',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: true,
      external,
    };

    const lambda = await deserializeLambda({}, config, '', new Map(), {
      LambdaClass: ExternalLambda,
      NodejsLambdaClass: ExternalNodejsLambda,
    });

    expect(lambda).toBeInstanceOf(ExternalNodejsLambda);
    expect((lambda as ExternalNodejsLambda).external).toEqual(external);
  });
});
