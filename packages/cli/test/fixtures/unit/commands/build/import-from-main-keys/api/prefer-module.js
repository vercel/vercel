import describeYourself from '../packages/prefer-module';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "prefer-module": ' + describeYourself());
}
