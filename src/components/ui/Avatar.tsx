import { initials } from "@/lib/taskHelpers";

interface AvatarProps {
  name?: string | null;
  color?: string;
  active?: boolean;
  size?: number;
}

export default function Avatar({ name, color, active = true, size = 26 }: AvatarProps) {
  if (!name) {
    return (
      <div
        title="Unassigned"
        style={{
          width: size, height: size, borderRadius: "50%", background: "#DDE3E0", color: "#7A837E",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}
      >
        ?
      </div>
    );
  }
  return (
    <div
      title={name + (active ? "" : " (Inactive)")}
      style={{
        width: size, height: size, borderRadius: "50%", background: color ?? "#0A5A46", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
        opacity: active ? 1 : 0.5,
      }}
    >
      {initials(name)}
    </div>
  );
}
