// ─── Small formatting helpers ─────────────────────────────────────────────

export function formatTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** Chat-list style stamp: time today, "Yesterday", else date. */
export function formatListTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 3600 * 1000;
  if (ts >= startOfToday) return formatTime(ts);
  if (ts >= startOfYesterday) return 'Yesterday';
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "online" / "last seen ..." label for chat headers. */
export function presenceLabel(online: boolean, lastSeen: number): string {
  if (online) return 'online';
  const mins = Math.floor((Date.now() - lastSeen) / 60000);
  if (mins < 1) return 'last seen just now';
  if (mins < 60) return `last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `last seen ${hours}h ago`;
  return `last seen ${formatListTime(lastSeen)}`;
}
