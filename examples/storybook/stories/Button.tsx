interface ButtonProps {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

export const Button = ({ label, primary = false, onClick }: ButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: primary ? "#1ea7fd" : "transparent",
        color: primary ? "white" : "#333",
        border: primary ? "none" : "1px solid #333",
        borderRadius: "4px",
        padding: "8px 16px",
        fontSize: "14px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
};
