import login from '../lib/login';

login().then(() => {
  console.log('> Logged in successfully. Token saved in ~/.now.json');
  process.exit(0);
});
