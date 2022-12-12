/* eslint-env jest */
import { Route } from '../src';
import { get_resolver } from '../src/resolver';
import {
  match_regex,
  hash_func,
  encode_query,
  regex_replace,
  parse_path,
  get_cache,
} from '../src/resolver-utils';

test('resolver simple', async () => {
  const routes: Route[] = [
    { src: '/user1', dest: '/u1' },
    { src: '/user2', dest: '/u2' },
  ];
  const outputs = new Set(['/u1', '/u2']);

  const check_file_system = async (outputPath: string) => {
    return outputs.has(outputPath);
  };
  const meta_cache: any = {};
  const result_cache: any = {};

  const resolver = get_resolver({
    check_file_system,
    encode_query,
    hash_func,
    match_regex,
    regex_replace,
    parse_path,
    route_key_meta_cache: get_cache(meta_cache),
    route_result_cache: get_cache(result_cache),
  });

  const deploymentMeta = {
    routes,
    wildcard: '',
    query: {},
    headers: {},
    cookies: {},
    host: 'example.vercel.sh',
    deployment_id: 'deployment123',
  };

  const result = await resolver({
    ...deploymentMeta,
    request_path: '/user1',
    request_method: 'GET',
  });

  expect(result).toEqual({
    dest_path: '/u1',
    file_system_checks: 1,
    finished: true,
    from_cache: false,
    headers: {},
    important_headers: {},
    is_directory: false,
    is_optimized_image_request: false,
    is_redirect: false,
    matched_output: true,
    query: {},
    req_headers: {},
    status: 200,
  });

  const result2 = await resolver({
    ...deploymentMeta,
    request_path: '/user1',
    request_method: 'GET',
  });

  expect(result2.from_cache).toBe(true);
  expect({
    ...result2,
    from_cache: false,
  }).toEqual(result);
});

test('resolver handle filesystem', async () => {
  const routes: Route[] = [
    {
      src: '/redirect-1',
      headers: {
        location: '/somewhere',
      },
      status: 307,
    },
    {
      handle: 'filesystem',
    },
    {
      src: '/file-1',
      dest: '/somewhere',
    },
  ];
  const outputs = new Set(['/file-1', '/file-2']);

  const check_file_system = async (outputPath: string) => {
    return outputs.has(outputPath);
  };
  const meta_cache: any = {};
  const result_cache: any = {};

  const resolver = get_resolver({
    route_key_meta_cache: get_cache(meta_cache),
    route_result_cache: get_cache(result_cache),
    check_file_system,
    encode_query,
    hash_func,
    match_regex,
    regex_replace,
    parse_path,
  });

  const deploymentMeta = {
    routes,
    wildcard: '',
    query: {},
    headers: {},
    cookies: {},
    host: 'example.vercel.sh',
    deployment_id: 'deployment123',
  };

  const result = await resolver({
    ...deploymentMeta,
    request_path: '/file-1',
    request_method: 'GET',
  });

  expect(result).toEqual({
    dest_path: '/file-1',
    file_system_checks: 1,
    finished: true,
    from_cache: false,
    headers: {},
    important_headers: {},
    is_directory: false,
    is_optimized_image_request: false,
    is_redirect: false,
    matched_output: true,
    query: {},
    req_headers: {},
    status: 200,
  });

  const result2 = await resolver({
    ...deploymentMeta,
    request_path: '/file-1',
    request_method: 'GET',
  });

  expect(result2.from_cache).toBe(true);
  expect({
    ...result2,
    from_cache: false,
  }).toEqual(result);
});

test('resolver handle error', async () => {
  const routes: Route[] = [
    {
      src: '/redirect-1',
      headers: {
        location: '/somewhere',
      },
      status: 307,
    },
    {
      handle: 'filesystem',
    },
    {
      src: '/file-1',
      dest: '/somewhere',
    },
    {
      handle: 'error',
    },
    {
      src: '/.*',
      status: 404,
      dest: '/404',
    },
  ];
  const outputs = new Set(['/file-1', '/file-2', '/404']);

  const check_file_system = async (outputPath: string) => {
    return outputs.has(outputPath);
  };
  const meta_cache: any = {};
  const result_cache: any = {};

  const resolver = get_resolver({
    route_key_meta_cache: get_cache(meta_cache),
    route_result_cache: get_cache(result_cache),
    check_file_system,
    encode_query,
    hash_func,
    match_regex,
    regex_replace,
    parse_path,
  });

  const deploymentMeta = {
    routes,
    wildcard: '',
    query: {},
    headers: {},
    cookies: {},
    host: 'example.vercel.sh',
    deployment_id: 'deployment123',
  };

  const result = await resolver({
    ...deploymentMeta,
    request_path: '/non-existent',
    request_method: 'GET',
  });

  expect(result).toEqual({
    dest_path: '/404',
    file_system_checks: 3,
    finished: true,
    from_cache: false,
    headers: {},
    important_headers: {},
    is_directory: false,
    is_optimized_image_request: false,
    is_redirect: false,
    matched_output: true,
    query: {},
    req_headers: {},
    status: 404,
  });

  const result2 = await resolver({
    ...deploymentMeta,
    request_path: '/non-existent',
    request_method: 'GET',
  });

  expect(result2.from_cache).toBe(true);
  expect({
    ...result2,
    from_cache: false,
  }).toEqual(result);

  // check with handle error specifically
  const result3 = await resolver({
    ...deploymentMeta,
    request_path: '/file-1',
    request_method: 'GET',
    error_status: 404,
    only_error_routes: true,
  });

  expect(result3).toEqual({
    dest_path: '/404',
    file_system_checks: 1,
    finished: true,
    from_cache: false,
    headers: {},
    important_headers: {},
    is_directory: false,
    is_optimized_image_request: false,
    is_redirect: false,
    matched_output: true,
    query: {},
    req_headers: {},
    status: 404,
  });

  const result4 = await resolver({
    ...deploymentMeta,
    request_path: '/file-1',
    request_method: 'GET',
    error_status: 404,
    only_error_routes: true,
  });

  expect(result4.from_cache).toBe(true);
  expect({
    ...result4,
    from_cache: false,
  }).toEqual(result3);
});

test('resolver handle miss', async () => {
  const routes: Route[] = [
    {
      src: '/redirect-1',
      headers: {
        location: '/somewhere',
      },
      status: 307,
    },
    {
      handle: 'filesystem',
    },
    {
      src: '/file-1',
      dest: '/somewhere',
    },
    {
      handle: 'error',
    },
    {
      src: '/.*',
      status: 404,
      dest: '/404',
    },
    {
      handle: 'miss',
    },
    {
      src: '/non-existent',
      dest: '/file-1',
    },
  ];
  const outputs = new Set(['/file-1', '/file-2', '/404']);

  const check_file_system = async (outputPath: string) => {
    return outputs.has(outputPath);
  };
  const meta_cache: any = {};
  const result_cache: any = {};

  const resolver = get_resolver({
    route_key_meta_cache: get_cache(meta_cache),
    route_result_cache: get_cache(result_cache),
    check_file_system,
    encode_query,
    hash_func,
    match_regex,
    regex_replace,
    parse_path,
  });

  const deploymentMeta = {
    routes,
    wildcard: '',
    query: {},
    headers: {},
    cookies: {},
    host: 'example.vercel.sh',
    deployment_id: 'deployment123',
  };

  const result = await resolver({
    ...deploymentMeta,
    request_path: '/non-existent',
    request_method: 'GET',
  });

  expect(result).toEqual({
    dest_path: '/file-1',
    file_system_checks: 2,
    finished: true,
    from_cache: false,
    headers: {},
    important_headers: {},
    is_directory: false,
    is_optimized_image_request: false,
    is_redirect: false,
    matched_output: true,
    query: {},
    req_headers: {},
    status: 200,
  });

  const result2 = await resolver({
    ...deploymentMeta,
    request_path: '/non-existent',
    request_method: 'GET',
  });

  expect(result2.from_cache).toBe(true);
  expect({
    ...result2,
    from_cache: false,
  }).toEqual(result);
});
