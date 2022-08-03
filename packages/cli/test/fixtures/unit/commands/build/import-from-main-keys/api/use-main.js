import describeYourself from '../packages/only-main';

export const config = {
  runtime: 'experimental-edge',
};

export default function () {
  return new Response('response from "use-main": ' + describeYourself());
}
