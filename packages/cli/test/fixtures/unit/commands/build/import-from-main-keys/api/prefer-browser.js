import describeYourself from '../packages/prefer-browser';

export const config = {
  runtime: 'experimental-edge',
};

export default function () {
  return new Response('response from "prefer-browser": ' + describeYourself());
}
