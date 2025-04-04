import { FOO } from 'src/foo';

export default req => {
  return new Response(`FOO:${FOO}`);
};
