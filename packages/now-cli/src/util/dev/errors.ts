export const httpStatusDescriptionMap = new Map([
  [400, 'BAD_REQUEST'],
  [402, 'PAYMENT_REQUIRED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT_FOUND'],
  [405, 'NOT_ALLOWED'],
  [410, 'GONE'],
  [413, 'PAYLOAD_TOO_LARGE'],
  [429, 'RATE_LIMITED'],
  [500, 'INTERNAL_SERVER_ERROR'],
  [501, 'NOT_IMPLEMENTED'],
  [502, 'BAD_GATEWAY'],
  [503, 'SERVICE_UNAVAILABLE'],
  [504, 'GATEWAY_TIMEOUT'],
  [508, 'INFINITE_LOOP'],
]);

export const errorMessageMap = new Map([
  [400, 'Bad request'],
  [402, 'Payment required'],
  [403, "You don't have the required permissions"],
  [404, 'The page could not be found'],
  [405, 'Method not allowed'],
  [410, 'The deployment has been removed'],
  [413, 'Request Entity Too Large'],
  [429, 'Rate limited'],
  [500, 'A server error has occurred'],
  [501, 'Not implemented'],
  [503, 'The deployment is currently unavailable'],
  [504, 'An error occurred with your deployment'],
  [508, 'Infinite loop detected'],
]);

interface ErrorMessage {
  title: string;
  subtitle?: string;
  app_error: boolean;
}

const appError = {
  title: 'An error occurred with this application.',
  subtitle: 'This is an error with the application itself, not the platform.',
  app_error: true,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const infrastructureError = {
  title: 'An internal error occurred with ZEIT Now.',
  subtitle: 'This is an error with the platform itself, not the application.',
  app_error: false,
};

const pageNotFoundError = {
  title: 'The page could not be found.',
  subtitle: 'The page could not be found in the application.',
  app_error: true,
};

export function generateErrorMessage(
  statusCode: number,
  errorCode: string // eslint-disable-line @typescript-eslint/no-unused-vars
): ErrorMessage {
  if (statusCode === 404) {
    return pageNotFoundError;
  }
  if (statusCode === 502) {
    return appError;
  }
  return {
    title: errorMessageMap.get(statusCode) || 'Error occurred',
    app_error: false,
  };
}

export function generateHttpStatusDescription(statusCode: number): string {
  return httpStatusDescriptionMap.get(statusCode) || 'UNKNOWN_ERROR';
}
