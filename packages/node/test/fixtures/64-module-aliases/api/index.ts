import { FOO } from '@/foo';

export default req => {
  return new Response(`FOO:${FOO}`);
};
