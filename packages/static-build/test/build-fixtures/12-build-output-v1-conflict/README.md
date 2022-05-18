# 12-build-output-v1-conflict

This fixture was built with the latest (at this time) nuxt 3 release candidate. To produce a potential Build Output API version detection conflict, the following was executed in the fixture directory and committed:

- `yarn nuxi build`: produced the `.output`
- `NOW_BUILDER=1 yarn nuxi build`: produced the `.vercel_build_output`

The `NOW_BUILDER` env var is being detected by the nuxt build to know to produce the Build Output API v1 format.

After creating this fixutre, `"nuxt": "3.0.0-rc.3"` was removed from the `package.json` dependencies so that it would not be installed during every test run. It's not necessary to run a test on this fixture and it was causing CI timeouts.
