import describeYourself from '../packages/prefer-main';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "prefer-main": ' + describeYourself());
}
