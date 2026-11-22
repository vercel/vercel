export default function replaceDevCommandPort(
  command: string,
  port: number
): string {
  return command.replace(/\$PORT/g, `${port}`).replace(/%PORT%/g, `${port}`);
}
