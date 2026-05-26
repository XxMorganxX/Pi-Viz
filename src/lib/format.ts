export function fmtTokens(n: number | undefined): string {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export function fmtCost(n: number | undefined): string {
  if (!n && n !== 0) return '—';
  if (n < 0.01) return '<$0.01';
  return '$' + n.toFixed(2);
}

export function fmtDuration(ms: number | undefined): string {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  return `${h.toFixed(1)}h`;
}

export function fmtTimestamp(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function shortMissionTitle(title: string, max = 100): string {
  if (!title) return '—';
  return title.length > max ? title.slice(0, max - 1) + '…' : title;
}
