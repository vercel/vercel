import { createApp, useBody, createError } from 'h3';
import { s as stringify } from './chunks/_utils.mjs';

function createStorageServer(storage, _opts = {}) {
  const app = createApp();
  app.use(async (req, res) => {
    if (req.method === "GET") {
      const val = await storage.getItem(req.url);
      if (!val) {
        const keys = await storage.getKeys(req.url);
        return keys.map((key) => key.replace(/:/g, "/"));
      }
      return stringify(val);
    }
    if (req.method === "HEAD") {
      const _hasItem = await storage.hasItem(req.url);
      res.statusCode = _hasItem ? 200 : 404;
      if (_hasItem) {
        const meta = await storage.getMeta(req.url);
        if (meta.mtime) {
          res.setHeader("Last-Modified", new Date(meta.mtime).toUTCString());
        }
      }
      return "";
    }
    if (req.method === "PUT") {
      const val = await useBody(req);
      await storage.setItem(req.url, val);
      return "OK";
    }
    if (req.method === "DELETE") {
      await storage.removeItem(req.url);
      return "OK";
    }
    throw createError({
      statusCode: 405,
      statusMessage: "Method Not Allowd"
    });
  });
  return {
    handle: app
  };
}

export { createStorageServer };
