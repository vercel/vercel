export const setupCloseHandlers = (
  cb: () => { routes: { src: string; dest: string; methods: string[] }[] }
) => {
  const callCallback = () => {
    const routes = cb();
    console.log(JSON.stringify(routes));
  };

  process.on('SIGINT', callCallback);
  process.on('SIGTERM', callCallback);
  process.on('exit', callCallback);
};
