const Pusher = require('pusher');

const {
  APP_ID: appId,
  KEY: key,
  SECRET: secret,
  CLUSTER: cluster,
} = process.env;

const pusher = new Pusher({
  appId,
  key,
  secret,
  cluster,
});

module.exports = async (req, res) => {
  const { x0, x1, y0, y1, color } = req.body;
  try {
    await new Promise((resolve, reject) => {
      pusher.trigger(
        'drawing-events',
        'drawing',
        { x0, x1, y0, y1, color },
        err => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
    res.status(200).end('sent event succesfully');
  } catch (e) {
    console.log(e.message);
  }
};
