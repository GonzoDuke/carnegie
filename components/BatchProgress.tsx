interface Props {
  total: number;
  done: number;
  label: string;
}

export function BatchProgress({ total, done, label }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="bg-cream-50 dark:bg-ink-soft/60 border border-cream-300 dark:border-ink-soft rounded-lg p-4">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-ink/70 dark:text-cream-300/70">{label}</span>
        <span className="font-mono">
          {done} / {total}
        </span>
      </div>
      <div className="h-2 bg-cream-200 dark:bg-ink rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300 ease-gentle"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
