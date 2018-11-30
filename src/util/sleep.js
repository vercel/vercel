const sleep = ms => new Promise(resolve => {
    setTimeout(resolve, ms);
  });

export default sleep;
