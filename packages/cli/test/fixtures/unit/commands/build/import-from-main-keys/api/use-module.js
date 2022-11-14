import describeYourself from '../packages/only-module';

export const config = {
  runtime: 'experimental-edge',
};

export default function () {
  return new Response('response from "use-module": ' + describeYourself());
}
