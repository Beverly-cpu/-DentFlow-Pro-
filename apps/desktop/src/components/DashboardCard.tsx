type DashboardCardProps = {
  title: string;

  value:
    | string
    | number;

  icon?: string;
};

export function DashboardCard({
  title,
  value,
  icon,
}: DashboardCardProps) {
  return (
    <div className="dashboard-card">
      <div className="dashboard-card-icon">
        {icon ?? "•"}
      </div>

      <div className="dashboard-card-content">
        <span className="dashboard-card-title">
          {title}
        </span>

        <strong className="dashboard-card-value">
          {value}
        </strong>
      </div>
    </div>
  );
}