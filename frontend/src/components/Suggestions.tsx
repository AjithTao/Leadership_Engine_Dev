export function Suggestions({ items }: { items: string[] }) {
  const chip = (s: string) =>
    s.match(/excellent|healthy/i) ? "bg-[#E4F2E8] text-[#2E7D46] dark:bg-emerald-900/30 dark:text-emerald-200" :
    s.match(/risk|drop/i) ? "bg-[#F9E3E7] text-[#C21F3A] dark:bg-rose-900/30 dark:text-rose-200" :
    "bg-amber-100 text-[#8A5E10] dark:bg-amber-900/30 dark:text-amber-200";
  return (
    <div className="rounded-2xl p-5 bg-[var(--bg-card)] text-[var(--text-primary)] dark:bg-card dark:text-card-foreground shadow-lg border border-[var(--border)] dark:border-border">
      <h3 className="text-lg font-semibold mb-3">AI Suggestions</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((s, i) => (<span key={i} className={`px-3 py-1 rounded-full text-sm ${chip(s)}`}>{s}</span>))}
      </div>
    </div>
  )
}