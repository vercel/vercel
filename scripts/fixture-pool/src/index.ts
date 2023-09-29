import tap from 'tap';
import Piscina from 'piscina';

const fixtures = [
  { framework: 'nextjs', versions: [ '13', '12', '11', '10', '9' ] },
  { framework: 'svelte', versions: [ '3', '4' ]},
  { framework: 'astro', versions: [ '3', '2' ]}
];

const piscina = new Piscina({ filename: require.resolve('./worker') });

const runs = Promise.all(
  fixtures.flatMap(({ framework, versions }) => versions.map(version =>
    tap.test(`Testing framework ${framework}@${version}`, async (t) => {
      t.resolveMatch(piscina.run({ framework, version }), true)
    })
  ))
)

runs.then(() => {
  console.log('Done!');
});

