import error from './output/error';
import exit from './exit';

export default (msg, code = 1) => {
  console.log(error(msg));
  exit(code);
};
