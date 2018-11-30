import error from './output/error';
import exit from './exit';

export default (msg, code = 1) => {
  error(msg);
  exit(code);
};
