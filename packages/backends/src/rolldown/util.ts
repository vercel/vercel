// Using unique delimiters with newlines and double underscores to minimize collision risk
export const BEGIN_INTROSPECTION_RESULT = '\n__VERCEL_INTROSPECTION_BEGIN__\n';
export const END_INTROSPECTION_RESULT = '\n__VERCEL_INTROSPECTION_END__\n';

export const setupCloseHandlers = (
  cb: () =>
    | {
        routes: { src: string; dest: string; methods: string[] }[];
        additionalFolders?: string[];
        additionalDeps?: string[];
      }
    | undefined
) => {
  const callCallback = () => {
    const result = cb();
    if (result) {
      // Use console.log with delimiters to send structured data via stdout
      console.log(
        `${BEGIN_INTROSPECTION_RESULT}${JSON.stringify(result)}${END_INTROSPECTION_RESULT}`
      );
    }
  };

  process.on('SIGINT', callCallback);
  process.on('SIGTERM', callCallback);
  process.on('exit', callCallback);
};
