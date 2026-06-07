export class ConnectionAuthorizationRequiredError extends Error {
  constructor(connectionName, options = {}) {
    super(options.message);
    this.name = 'ConnectionAuthorizationRequiredError';
    this.connectionName = connectionName;
  }
}

export class ConnectionAuthorizationFailedError extends Error {
  constructor(connectionName, options = {}) {
    super(options.message);
    this.name = 'ConnectionAuthorizationFailedError';
    this.connectionName = connectionName;
    this.reason = options.reason;
    this.retryable = options.retryable;
  }
}
