const { deepEqual } = require('assert');
const { mergeRoutes } = require('../dist/merge');

test('mergeRoutes simple', () => {
  const userRoutes = [
    { src: '/user1', dest: '/u1' },
    { src: '/user2', dest: '/u2' },
  ];
  const builds = [
    {
      use: '@now/node',
      entrypoint: 'api/home.js',
      routes: [{ src: '/node1', dest: '/n1' }, { src: '/node2', dest: '/n2' }],
    },
    {
      use: '@now/python',
      entrypoint: 'api/users.py',
      routes: [
        { src: '/python1', dest: '/py1' },
        { src: '/python2', dest: '/py2' },
      ],
    },
  ];
  const actual = mergeRoutes({ userRoutes, builds });
  const expected = [
    { dest: '/u1', src: '/user1' },
    { dest: '/u2', src: '/user2' },
    { dest: '/n1', src: '/node1' },
    { dest: '/n2', src: '/node2' },
    { dest: '/py1', src: '/python1' },
    { dest: '/py2', src: '/python2' },
  ];
  deepEqual(actual, expected);
});

test('mergeRoutes continue', () => {
  const userRoutes = [
    { src: '/user1', dest: '/u1', continue: true },
    { src: '/user2', dest: '/u2' },
  ];
  const builds = [
    {
      use: '@now/node',
      entrypoint: 'api/home.js',
      routes: [
        { src: '/node1', dest: '/n1', continue: true },
        { src: '/node2', dest: '/n2' },
      ],
    },
    {
      use: '@now/python',
      entrypoint: 'api/users.py',
      routes: [
        { src: '/python1', dest: '/py1', continue: true },
        { src: '/python2', dest: '/py2' },
      ],
    },
  ];
  const actual = mergeRoutes({ userRoutes, builds });
  const expected = [
    { continue: true, dest: '/u1', src: '/user1' },
    { dest: '/u2', src: '/user2' },
    { continue: true, dest: '/n1', src: '/node1' },
    { dest: '/n2', src: '/node2' },
    { continue: true, dest: '/py1', src: '/python1' },
    { dest: '/py2', src: '/python2' },
  ];
  deepEqual(actual, expected);
});

test('mergeRoutes handle filesystem user routes', () => {
  const userRoutes = [
    { src: '/user1', dest: '/u1' },
    { handle: 'filesystem' },
    { src: '/user2', dest: '/u2' },
  ];
  const builds = [
    {
      use: '@now/node',
      entrypoint: 'api/home.js',
      routes: [{ src: '/node1', dest: '/n1' }, { src: '/node2', dest: '/n2' }],
    },
    {
      use: '@now/python',
      entrypoint: 'api/users.py',
      routes: [
        { src: '/python1', dest: '/py1' },
        { src: '/python2', dest: '/py2' },
      ],
    },
  ];
  const actual = mergeRoutes({ userRoutes, builds });
  const expected = [
    { dest: '/u1', src: '/user1' },
    { dest: '/n1', src: '/node1' },
    { dest: '/n2', src: '/node2' },
    { dest: '/py1', src: '/python1' },
    { dest: '/py2', src: '/python2' },
    { handle: 'filesystem' },
    { dest: '/u2', src: '/user2' },
  ];
  deepEqual(actual, expected);
});

test('mergeRoutes handle filesystem build routes', () => {
  const userRoutes = [
    { src: '/user1', dest: '/u1' },
    { src: '/user2', dest: '/u2' },
  ];
  const builds = [
    {
      use: '@now/node',
      entrypoint: 'api/home.js',
      routes: [
        { src: '/node1', dest: '/n1' },
        { handle: 'filesystem' },
        { src: '/node2', dest: '/n2' },
      ],
    },
    {
      use: '@now/python',
      entrypoint: 'api/users.py',
      routes: [
        { src: '/python1', dest: '/py1' },
        { handle: 'filesystem' },
        { src: '/python2', dest: '/py2' },
      ],
    },
  ];
  const actual = mergeRoutes({ userRoutes, builds });
  const expected = [
    { dest: '/u1', src: '/user1' },
    { dest: '/u2', src: '/user2' },
    { dest: '/n1', src: '/node1' },
    { dest: '/py1', src: '/python1' },
    { handle: 'filesystem' },
    { dest: '/n2', src: '/node2' },
    { dest: '/py2', src: '/python2' },
  ];
  deepEqual(actual, expected);
});

test('mergeRoutes handle filesystem both user and builds', () => {
  const userRoutes = [
    { src: '/user1', dest: '/u1' },
    { handle: 'filesystem' },
    { src: '/user2', dest: '/u2' },
  ];
  const builds = [
    {
      use: '@now/node',
      entrypoint: 'api/home.js',
      routes: [
        { src: '/node1', dest: '/n1' },
        { handle: 'filesystem' },
        { src: '/node2', dest: '/n2' },
      ],
    },
    {
      use: '@now/python',
      entrypoint: 'api/users.py',
      routes: [
        { src: '/python1', dest: '/py1' },
        { handle: 'filesystem' },
        { src: '/python2', dest: '/py2' },
      ],
    },
  ];
  const actual = mergeRoutes({ userRoutes, builds });
  const expected = [
    { dest: '/u1', src: '/user1' },
    { dest: '/n1', src: '/node1' },
    { dest: '/py1', src: '/python1' },
    { handle: 'filesystem' },
    { dest: '/u2', src: '/user2' },
    { dest: '/n2', src: '/node2' },
    { dest: '/py2', src: '/python2' },
  ];
  deepEqual(actual, expected);
});
