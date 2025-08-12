export default function Section({ id, className = "", children }) {
  return <section id={id} className={`container ${className}`}>{children}</section>;
}
