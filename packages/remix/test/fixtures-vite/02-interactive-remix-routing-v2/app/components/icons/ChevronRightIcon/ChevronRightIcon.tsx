type IconProps = {
  className?: string;
  strokeWidth?: number;
};
export default function ChevronRightIcon({
  className = "w-6 h-6",
  strokeWidth = 2.5,
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 2L15 12L9 22" />
    </svg>
  );
}
