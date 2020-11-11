const path = require('path')
const { promises: fs } = require('fs')

async function main() {
  console.log('installCommand...')

  await fs.writeFile(
    path.join(__dirname, 'web', 'public', 'install.txt'),
    `installCommand.`
  )

  console.log('Finished installing...')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
