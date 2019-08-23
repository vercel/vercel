export default function strlen(str: string) {
  return str.replace(/\u001b[^m]*m/g, '').length;
}
