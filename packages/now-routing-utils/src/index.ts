export type NowError = {
  code: string;
  message: string;
  errors: {
    message: string;
    src?: string;
    handle?: string;
  }[];
  sha?: string; // File errors
};

export type Source = {
  src: string;
  dest?: string;
  headers?: {};
  methods?: string[];
  continue?: boolean;
  status?: number;
};

export type Handler = {
  handle: string;
};

export type Route = Source | Handler;

export function isHandler(route: Route): route is Handler {
  return typeof (route as Handler).handle !== 'undefined';
}

export function normalizeRoutes(
  inputRoutes: Array<Route> | null
): { routes: Array<Route> | null; error: NowError | null } {
  if (!inputRoutes || inputRoutes.length === 0) {
    return { routes: inputRoutes, error: null };
  }

  const routes: Route[] = [];
  const handling: string[] = [];
  const errors = [];

  // We don't want to treat the input routes as references
  inputRoutes.forEach(r => routes.push(Object.assign({}, r)));

  for (const route of routes) {
    if (isHandler(route)) {
      // typeof { handle: string }
      if (Object.keys(route).length !== 1) {
        errors.push({
          message: `Cannot have any other keys when handle is used (handle: ${route.handle})`,
          handle: route.handle
        });
      }
      if (!['filesystem'].includes(route.handle)) {
        errors.push({
          message: `This is not a valid handler (handle: ${route.handle})`,
          handle: route.handle
        });
      }
      if (handling.includes(route.handle)) {
        errors.push({
          message: `You can only handle something once (handle: ${route.handle})`,
          handle: route.handle
        });
      } else {
        handling.push(route.handle);
      }
    } else if (route.src) {
      // Route src should always start with a '^'
      if (!route.src.startsWith('^')) {
        route.src = `^${route.src}`;
      }

      // Route src should always end with a '$'
      if (!route.src.endsWith('$')) {
        route.src = `${route.src}$`;
      }

      try {
        // This feels a bit dangerous if there would be a vulnerability in RegExp.
        new RegExp(route.src);
      } catch (err) {
        errors.push({
          message: `Invalid regular expression: "${route.src}"`,
          src: route.src
        });
      }
    } else {
      errors.push({
        message: 'A route must set either handle or src'
      });
    }
  }

  const error =
    errors.length > 0
      ? {
          code: 'invalid_routes',
          message: `One or more invalid routes were found: \n${JSON.stringify(
            errors,
            null,
            2
          )}`,
          errors
        }
      : null;

  return { routes, error };
}

/**
 * An ajv schema for the routes array
 */
export const schema = {
  type: 'array',
  maxItems: 1024,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      src: {
        type: 'string',
        maxLength: 4096
      },
      dest: {
        type: 'string',
        maxLength: 4096
      },
      methods: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'string',
          maxLength: 32
        }
      },
      headers: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        maxProperties: 100,
        patternProperties: {
          '^.{1,256}$': {
            type: 'string',
            maxLength: 4096
          }
        }
      },
      handle: {
        type: 'string',
        maxLength: 32
      },
      continue: {
        type: 'boolean'
      },
      status: {
        type: 'integer',
        minimum: 100,
        maximum: 999
      }
    }
  }
};
