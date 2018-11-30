//      
import sleep from './sleep';

function createPollingFn   (
  future                                ,
  sleepTime        
)                                                    {
  return async function*(...args       ) {
    while (true) {
      yield await future(...args);
      await sleep(sleepTime);
    }
  };
}

export default createPollingFn;
