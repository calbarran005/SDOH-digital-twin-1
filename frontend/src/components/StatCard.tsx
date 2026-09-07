import { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  icon,
  subtext,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  subtext?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="stat-card-inner">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {subtext && <div className="stat-subtext">{subtext}</div>}
        </div>
        {icon && <div className="stat-icon-wrapper">{icon}</div>}
      </div>
    </div>
  );
}
