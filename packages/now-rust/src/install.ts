import installRust from './install-rust';

installRust().catch(err => {
  console.error(err);
  process.exit(1);
});
