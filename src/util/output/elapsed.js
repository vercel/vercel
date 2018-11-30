//      
import ms from 'ms';
import chalk from 'chalk';

// styles the "[30ms]" string based on a number of ms
export default function elapsed(time        , ago         )         {
  return chalk.gray(`[${time < 1000 ? `${time}ms` : ms(time)}${ago ? ' ago' : ''}]`);
};
