import Piscina from 'piscina';

const fixtures = [
  { framework: 'nextjs', versions: [ '13', '12', '11', '10', '9' ] },
  { framework: 'svelte', versions: [ '3', '4' ]},
  { framework: 'astro', versions: [ '3', '2' ]}
];

const piscina = new Piscina({ filename: require.resolve('./worker') });

const runs = Promise.all(
  fixtures.flatMap(({ framework, versions }) => versions.map(version => piscina.run({ framework, version })))
)

runs.then(() => {
  console.log('Done!');
});

