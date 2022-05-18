const Blob = globalThis.Blob;
const File = globalThis.File;
const FormData = globalThis.FormData;
const Headers = globalThis.Headers;
const Request = globalThis.Request;
const Response = globalThis.Response;
const AbortController = globalThis.AbortController;
const fetch = globalThis.fetch || (() => {
  throw new Error("global fetch is not available!");
});

export { AbortController, Blob, File, FormData, Headers, Request, Response, fetch as default, fetch };
