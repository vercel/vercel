export const setupCloseHandlers = (
  cb: () =>
    | {
        frameworkSlug: string;
        routes: { src: string; dest: string; methods: string[] }[];
      }
    | undefined
) => {
  const callCallback = () => {
    const result = cb();
    if (result) {
      console.log(JSON.stringify(result));
    }
  };

  process.on('SIGINT', callCallback);
  process.on('SIGTERM', callCallback);
  process.on('exit', callCallback);
};
