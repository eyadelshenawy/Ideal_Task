import type { AssigneeDisplay } from "@/types/models";
import Avatar from "./Avatar";

interface AvatarStackProps {
  assignees: AssigneeDisplay[];
  size?: number;
  max?: number;
}

export default function AvatarStack({ assignees, size = 24, max = 3 }: AvatarStackProps) {
  if (assignees.length === 0) {
    return <Avatar size={size} />;
  }

  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;

  return (
    <div className="flex items-center">
      {visible.map((a, i) => (
        <div
          key={`${a.kind}-${a.name}-${i}`}
          style={{ marginLeft: i === 0 ? 0 : -8, zIndex: visible.length - i, borderRadius: "50%", border: "2px solid #fff", boxSizing: "content-box" }}
        >
          <Avatar name={a.name} color={a.color} active={a.active} kind={a.kind} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          title={`+${overflow} more`}
          style={{
            marginLeft: -8, width: size, height: size, borderRadius: "50%", background: "#DDE3E0", color: "#5B6B64",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
            border: "2px solid #fff", boxSizing: "content-box", flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
