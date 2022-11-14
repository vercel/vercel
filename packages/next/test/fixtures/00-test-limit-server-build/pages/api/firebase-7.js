import firebase from 'firebase';

export default (req, res) => {
  res.json({ hello: 'world', firebase: true });
};
