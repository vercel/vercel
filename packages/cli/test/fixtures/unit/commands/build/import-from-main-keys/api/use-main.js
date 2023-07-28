import describeYourself from '../packages/only-main';

export const config = {
  runtime: 'edge',
};

export default function () {
  return new Response('response from "use-main": ' + describeYourself());
}
