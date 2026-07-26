import type { CSSProperties, ReactNode } from "react";

export default function Chip({
  children,
  style,
  small,
}: {
  children: ReactNode;
  style?: CSSProperties;
  small?: boolean;
}) {
  return (
    <span
      style={{
        ...style,
        fontSize: small ? 11 : 12,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}
