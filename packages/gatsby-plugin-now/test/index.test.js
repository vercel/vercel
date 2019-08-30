test('test generated now routes', async () => {
  const nowRoutes = require('./fixtures/public/__now_routes_g4t5bY.json');

  expect(nowRoutes).toMatchSnapshot();
});
