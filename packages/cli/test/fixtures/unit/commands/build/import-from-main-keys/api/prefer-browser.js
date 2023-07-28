import describeYourself from '../packages/prefer-browser';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "prefer-browser": ' + describeYourself());
}
