import { Elysia } from 'elysia';
import { availabilityCheck } from './availabilityCheck';
import { users } from './users';

export const routes = new Elysia().use(availabilityCheck).use(users);
