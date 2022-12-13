import describeYourself from '../packages/only-browser';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "use-browser": ' + describeYourself());
}
