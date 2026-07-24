export function KpiCards({ completion, defect, capacity }: { completion?: number|null; defect?: number|null; capacity?: number|null }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-2xl p-4 bg-[var(--bg-card)] text-[var(--text-primary)] dark:bg-card dark:text-card-foreground shadow border border-[var(--border)] dark:border-border">
        <div className="text-sm text-[var(--text-muted)] dark:text-muted-foreground">Completion</div>
        <div className="text-2xl font-semibold">{completion != null ? `${completion}%` : "—"}</div>
      </div>
      <div className="rounded-2xl p-4 bg-[var(--bg-card)] text-[var(--text-primary)] dark:bg-card dark:text-card-foreground shadow border border-[var(--border)] dark:border-border">
        <div className="text-sm text-[var(--text-muted)] dark:text-muted-foreground">Defect Ratio</div>
        <div className="text-2xl font-semibold">{defect != null ? `${defect}%` : "—"}</div>
      </div>
      <div className="rounded-2xl p-4 bg-[var(--bg-card)] text-[var(--text-primary)] dark:bg-card dark:text-card-foreground shadow border border-[var(--border)] dark:border-border">
        <div className="text-sm text-[var(--text-muted)] dark:text-muted-foreground">Capacity Baseline</div>
        <div className="text-2xl font-semibold">{capacity != null ? capacity : "—"}</div>
      </div>
    </div>
  );
}