const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeAge(timestampMs: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - timestampMs);
  if (delta < MINUTE) return 'justo ahora';
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE);
    return `hace ${m} min`;
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.floor(delta / DAY);
  if (d < 30) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const months = Math.floor(d / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function startOfISOWeek(timestampMs: number): number {
  const d = new Date(timestampMs);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function isSameISOWeek(a: number, b: number): boolean {
  return startOfISOWeek(a) === startOfISOWeek(b);
}
