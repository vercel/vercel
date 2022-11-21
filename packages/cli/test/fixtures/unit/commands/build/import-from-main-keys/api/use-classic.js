import describeYourself from '../packages/only-classic';

export const config = {
  runtime: 'experimental-edge',
};

export default function () {
  return new Response('response from "use-classic": ' + describeYourself());
}
