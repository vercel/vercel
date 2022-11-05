import { deepEqual } from 'assert';
import { appendRoutesToPhase } from '../src/append';
import { Route } from '../src/types';

test('appendRoutesToPhase `routes=null` and `newRoutes=[]`', () => {
  const routes = null;
  const newRoutes: Route[] = [];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected: Route[] = [];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase `routes=null` and one `newRoutes`', () => {
  const routes = null;
  const newRoutes = [{ src: '/foo', dest: '/bar' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [{ handle: 'filesystem' }, ...newRoutes];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase `routes=[]` and `newRoutes=null`', () => {
  const routes: Route[] = [];
  const newRoutes = null;
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected: Route[] = [];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase `routes=[]` and `newRoutes=[]`', () => {
  const routes: Route[] = [];
  const newRoutes: Route[] = [];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected: Route[] = [];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase one routes, zero newRoutes', () => {
  const routes = [{ src: '/foo', dest: '/bar' }];
  const newRoutes: Route[] = [];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = routes;
  deepEqual(actual, expected);
});

test('appendRoutesToPhase zero routes, one newRoutes', () => {
  const routes: Route[] = [];
  const newRoutes = [{ src: '/foo', dest: '/bar' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [{ handle: 'filesystem' }, ...newRoutes];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase two routes in phase', () => {
  const routes: Route[] = [
    { handle: 'filesystem' },
    { src: '/first', dest: '/one' },
  ];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { handle: 'filesystem' },
    { src: '/first', dest: '/one' },
    { src: '/new', dest: '/to' },
  ];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase two routes out of phase', () => {
  const routes: Route[] = [
    { handle: 'resource' },
    { src: '/first', dest: '/one' },
  ];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { handle: 'resource' },
    { src: '/first', dest: '/one' },
    { handle: 'filesystem' },
    { src: '/new', dest: '/to' },
  ];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase one routes before, two routes in phase', () => {
  const routes: Route[] = [
    { src: '/first', dest: '/one' },
    { handle: 'filesystem' },
    { src: '/second', dest: '/two' },
  ];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { src: '/first', dest: '/one' },
    { handle: 'filesystem' },
    { src: '/second', dest: '/two' },
    { src: '/new', dest: '/to' },
  ];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase one routes before, two routes in phase, two routes in different phase', () => {
  const routes: Route[] = [
    { src: '/first', dest: '/one' },
    { handle: 'filesystem' },
    { src: '/second', dest: '/two' },
    { handle: 'miss' },
    { src: '/third', dest: '/three' },
  ];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { src: '/first', dest: '/one' },
    { handle: 'filesystem' },
    { src: '/second', dest: '/two' },
    { src: '/new', dest: '/to' },
    { handle: 'miss' },
    { src: '/third', dest: '/three' },
  ];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase to null phase', () => {
  const routes: Route[] = [
    { src: '/first', dest: '/one' },
    { src: '/second', dest: '/two' },
    { handle: 'filesystem' },
    { src: '/third', dest: '/three' },
  ];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = null;
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { src: '/first', dest: '/one' },
    { src: '/second', dest: '/two' },
    { src: '/new', dest: '/to' },
    { handle: 'filesystem' },
    { src: '/third', dest: '/three' },
  ];

  deepEqual(actual, expected);
});

test('appendRoutesToPhase to null phase with no handle', () => {
  const routes: Route[] = [
    { src: '/first', dest: '/one' },
    { src: '/second', dest: '/two' },
  ];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = null;
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { src: '/first', dest: '/one' },
    { src: '/second', dest: '/two' },
    { src: '/new', dest: '/to' },
  ];

  deepEqual(actual, expected);
});

test('appendRoutesToPhase to null phase with two new routes ', () => {
  const routes: Route[] = [
    { src: '/first', dest: '/one' },
    { src: '/second', dest: '/two' },
    { handle: 'filesystem' },
    { src: '/third', dest: '/three' },
  ];
  const newRoutes = [
    { src: '/new1', dest: '/to1' },
    { src: '/new2', dest: '/to2' },
  ];
  const phase = null;
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [
    { src: '/first', dest: '/one' },
    { src: '/second', dest: '/two' },
    { src: '/new1', dest: '/to1' },
    { src: '/new2', dest: '/to2' },
    { handle: 'filesystem' },
    { src: '/third', dest: '/three' },
  ];

  deepEqual(actual, expected);
});

test('appendRoutesToPhase to null phase `routes=[]`', () => {
  const routes: Route[] = [];
  const newRoutes = [{ src: '/new', dest: '/to' }];
  const phase = null;
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [{ src: '/new', dest: '/to' }];

  deepEqual(actual, expected);
});
