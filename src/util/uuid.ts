/** Generates UUID v4 */

export default function uuid() {
  function s(n: number) {
    return h((Math.random() * (1 << (n << 2))) ^ Date.now()).slice(-n);
  }
  function h(n: number) {
    return (n | 0).toString(16);
  }
  return [
    s(4) + s(4),
    s(4),
    `4${s(3)}`, // UUID version 4
    h(8 | (Math.random() * 4)) + s(3), // {8|9|A|B}xxx
    Date.now()
      .toString(16)
      .slice(-10) + s(2) // Use timestamp to avoid collisions
  ].join('-');
}
