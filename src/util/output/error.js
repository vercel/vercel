import chalk from 'chalk';

export default (...input) => {
  let messages = input;

  if (typeof input[0] === 'object') {
    const { slug, message } = input[0];
    messages = [message];

    if (slug) {
      messages.push(`> More details: https://err.sh/now-cli/${slug}`);
    }
  }

  return `${chalk.red('> Error!')} ${messages.join('\n')}`;
};
