import * as middleware from './_middleware';
_ENTRIES = typeof _ENTRIES === 'undefined' ? {} : _ENTRIES;
_ENTRIES['middleware_pages/_middleware'] = {
  default: async function (ev) {
    const result = await middleware.default(ev);
    if (result instanceof Response) {
      return {
        promise: Promise.resolve(),
        waitUntil: Promise.resolve(),
        response: result,
      };
    }
    return result;
  },
};
