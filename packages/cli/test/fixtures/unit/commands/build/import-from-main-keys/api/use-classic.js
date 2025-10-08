import describeYourself from '../packages/only-classic';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "use-classic": ' + describeYourself());
}
