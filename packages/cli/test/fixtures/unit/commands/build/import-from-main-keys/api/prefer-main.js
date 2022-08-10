import describeYourself from '../packages/prefer-main';

export const config = {
  runtime: 'experimental-edge',
};

export default function () {
  return new Response('response from "prefer-main": ' + describeYourself());
}
