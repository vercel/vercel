import describeYourself from '../packages/only-module';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "use-module": ' + describeYourself());
}
