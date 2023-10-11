# dojo-v2 Widget Library

This widget library was generated with the [Dojo CLI](https://github.com/dojo/cli) & [Dojo CLI create widget command](https://github.com/dojo/cli-create-widget).

## Building

### Library

To create a build of the widget library run `npm run build`. The built artifacts will be output to the `output/dist` directory.

### Documentation 

This project uses [`@dojo/parade`](https://github.com/dojo/parade) to generate widget examples, documentation and run widget tests (development only). The widget examples can be found in the `src/examples` directory, for more information on `@dojo/parade` please reference the [README](https://github.com/dojo/parade/blob/master/README.md).

To generate the documentation run `npm run docs`, the output will be written to `output/dist`.

## Development

To start the [`@dojo/parade`](https://github.com/dojo/parade) development server run `npm run dev`, this will start the widget examples with test runner at http://localhost:9999.

## Testing 

This project uses the `@dojo/cli-test-intern` command for running unit tests, the tests can be run using ts-node using `npm test` and with a headless browser using `npm run test:headless`.

## Further help

To get help for these commands and more, run `dojo` on the command line.