module.exports = stdout =>
  stdout
    .split('\n')
    .filter(line => line.includes('.now.sh') || line.includes('.vercel.app'))
    .map(
      line =>
        line
          .split(' ')
          .filter(
            part => part.includes('.now.sh') || part.includes('.vercel.app')
          )[0]
    );
