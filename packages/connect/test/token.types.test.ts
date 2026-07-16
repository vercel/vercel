import { expectTypeOf, it } from 'vitest';
import type {
  ConnectPassportOptions,
  ConnectPassportTokenSubject,
  ConnectTokenSubject,
} from '../src/index.js';

it('exports Passport subject and credential types', () => {
  expectTypeOf<ConnectPassportTokenSubject>().toEqualTypeOf<{
    type: 'passport';
  }>();
  expectTypeOf<ConnectPassportTokenSubject>().toMatchTypeOf<ConnectTokenSubject>();
  expectTypeOf<ConnectPassportOptions>().toEqualTypeOf<{
    passportToken: string;
    passportResource?: string;
  }>();
});
