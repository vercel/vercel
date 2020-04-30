const { deepEqual } = require('assert');
const { appendRoutesToPhase } = require('../dist/append');

test('appendRoutesToPhase `routes=null` and `newRoutes=[]`', () => {
  const routes = null;
  const newRoutes = [];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [];
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
  const routes = [];
  const newRoutes = null;
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase `routes=[]` and `newRoutes=[]`', () => {
  const routes = [];
  const newRoutes = [];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase one routes, zero newRoutes', () => {
  const routes = [{ src: '/foo', dest: '/bar' }];
  const newRoutes = [];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = routes;
  deepEqual(actual, expected);
});

test('appendRoutesToPhase zero routes, one newRoutes', () => {
  const routes = [];
  const newRoutes = [{ src: '/foo', dest: '/bar' }];
  const phase = 'filesystem';
  const actual = appendRoutesToPhase({ routes, newRoutes, phase });
  const expected = [{ handle: 'filesystem' }, ...newRoutes];
  deepEqual(actual, expected);
});

test('appendRoutesToPhase two routes in phase', () => {
  const routes = [{ handle: 'filesystem' }, { src: '/first', dest: '/one' }];
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
  const routes = [{ handle: 'resource' }, { src: '/first', dest: '/one' }];
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
  const routes = [
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
  const routes = [
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
