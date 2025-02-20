import { flag } from '@vercel/flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() {
    // this flag will be on for 50% of visitors
    return Math.random() > 0.5;
  },
});
