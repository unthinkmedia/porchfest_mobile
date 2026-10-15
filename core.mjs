export function eventClock(now, event) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: event.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function scheduleState(data, now = new Date()) {
  const clock = eventClock(now, data.event);
  const ordered = [...data.sets].sort((a, b) => a.start - b.start || a.porchId.localeCompare(b.porchId));
  const current = clock.date === data.event.date
    ? ordered.filter(set => set.start <= clock.minute && clock.minute < set.end) : [];
  const future = clock.date < data.event.date ? ordered
    : clock.date === data.event.date ? ordered.filter(set => set.start > clock.minute) : [];
  const nextStart = future[0]?.start;
  const next = future.filter(set => set.start === nextStart);
  const finished = clock.date > data.event.date
    || (clock.date === data.event.date && clock.minute >= Math.max(...ordered.map(set => set.end)));
  return { current, next, finished, before: clock.date < data.event.date, clock };
}

export function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export function mapUrl(porch) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(porch.mapQuery)}`;
}

export function venmoUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["venmo.com", "www.venmo.com", "account.venmo.com"].includes(url.hostname)
      ? url.href : null;
  } catch {
    return null;
  }
}
