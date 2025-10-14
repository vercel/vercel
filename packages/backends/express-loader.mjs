export async function resolve(specifier, context, nextResolve) {
  console.log('specifier', specifier);
  if (specifier === 'express') {
    console.log('=== ESM LOADER: Resolving express ===');
    console.log('Specifier:', specifier);
    console.log('Context:', context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  console.log('url', url);
  const result = await nextLoad(url, context);

  if (url.includes('node_modules/express') && url.includes('index.js')) {
    console.log('=== ESM LOADER: Loading express ===');
    console.log('URL:', url);
    console.log('Format:', result.format);
  }

  return result;
}

console.log('ESM Loader installed!');
