export default (req, resp) => {
  resp.send('Cats are the best!'.endsWith('best!'));
};
