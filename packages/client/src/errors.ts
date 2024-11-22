export class DeploymentError extends Error {
  constructor(err: { code: string; message: string; name?: string }) {
    super(err.message);
    this.code = err.code;
    this.rateLimitName = err.name;
    this.name = 'DeploymentError';
  }

  code: string;
  rateLimitName: string | undefined;
}
