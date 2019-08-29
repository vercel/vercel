test('test generated now routes', async () => {
  const nowRoutes = require('./fixtures/public/__now_routes.json');

  expect(nowRoutes).toMatchSnapshot();
});
