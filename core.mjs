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

export function paymentLink(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.replace(/^www\./, "");
    const services = {
      "venmo.com": "Venmo", "account.venmo.com": "Venmo",
      "cash.app": "Cash App",
      "paypal.me": "PayPal", "paypal.com": "PayPal",
      "zellepay.com": "Zelle", "enroll.zellepay.com": "Zelle", "zelle.com": "Zelle",
    };
    const service = Object.hasOwn(services, host) ? services[host] : null;
    if (service && url.pathname === "/" && !url.search) return null;
    return { url: url.href, service };
  } catch {
    return null;
  }
}
