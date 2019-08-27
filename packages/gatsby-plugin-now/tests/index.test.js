const execa = require('execa')
const { join } = require('path')

jest.setTimeout(30000)

test('test generated now routes', async () => {
  await execa('gatsby', ['build'], {
    preferLocal: true,
    cwd: join(__dirname, 'fixtures')
  })

  const nowRoutes = require('./fixtures/public/__now_routes.json')

  expect(nowRoutes).toMatchSnapshot()
})
