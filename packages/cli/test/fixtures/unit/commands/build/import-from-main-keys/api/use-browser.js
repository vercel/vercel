import describeYourself from '../packages/only-browser';

export const config = {
  runtime: 'experimental-edge',
};

export default function () {
  return new Response('response from "use-browser": ' + describeYourself());
}
