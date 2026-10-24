export type Task = {
  id: string; title: string; description: string | null;
  scheduled_date: string | null; estimated_minutes: number | null;
  completed: boolean; completed_at: string | null;
};

// Calendar arithmetic uses UTC day numbers; timestamps use the student's local date.
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function adaptSchedule(tasks: Task[], today: string, deadline: string, hours: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(hours) || hours < 0.25 || hours > 12 || deadline < today || deadline > addDays(today, 366)) {
    throw new Error("Choose a deadline within the next year and between 0.25 and 12 hours per day.");
  }
  const capacity = Math.floor(hours * 60);
  const pending = tasks.filter(t => !t.completed).sort((a, b) =>
    (a.scheduled_date || today).localeCompare(b.scheduled_date || today) || a.id.localeCompare(b.id));
  const fixed = new Map<string, number>();
  tasks.filter(t => t.completed && t.scheduled_date).forEach(t => {
    fixed.set(t.scheduled_date!, (fixed.get(t.scheduled_date!) || 0) + (t.estimated_minutes ?? 30));
  });
  let day = today;
  let used = 0;
  return pending.map(task => {
    const minutes = task.estimated_minutes ?? 30;
    if (!Number.isInteger(minutes) || minutes <= 0) throw new Error(`Set a valid duration for ${task.title}.`);
    if (minutes > capacity) throw new Error(`“${task.title}” needs ${minutes} minutes. Increase your daily study time.`);
    while (day <= deadline && used + minutes + (fixed.get(day) || 0) > capacity) { day = addDays(day, 1); used = 0; }
    if (day > deadline) throw new Error("Your remaining tasks do not fit. Extend the deadline or increase your daily study time.");
    used += minutes;
    return { id: task.id, scheduled_date: day };
  });
}
export function analytics(tasks: Task[], now = new Date()) {
  const today = localDay(now);
  const days = [...new Set(tasks.filter(t => t.completed && t.completed_at)
    .map(t => localDay(new Date(t.completed_at!))))].filter(d => d <= today).sort();
  const active = new Set(days);
  let cursor = active.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (active.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  let best = 0, run = 0;
  days.forEach((day, i) => { run = i && addDays(days[i - 1], 1) === day ? run + 1 : 1; best = Math.max(best, run); });
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const completed = tasks.filter(t => t.completed && t.completed_at && localDay(new Date(t.completed_at)) === day);
    return { day, count: completed.length, minutes: completed.reduce((sum, t) => sum + (t.estimated_minutes ?? 30), 0) };
  });
  return { current, best, week, overdue: tasks.filter(t => !t.completed && t.scheduled_date && t.scheduled_date < today).length };
}
function escapeICS(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
// RFC 5545 folds at 75 octets, including non-ASCII task titles.
function fold(line: string) {
  const chunks: string[] = []; let part = ""; let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { chunks.push(part); part = " "; bytes = 1; }
    part += char; bytes += size;
  }
  chunks.push(part); return chunks.join("\r\n");
}
export function calendarFile(tasks: Task[], now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Study Buddy//Study Plans//EN", "CALSCALE:GREGORIAN"];
  tasks.filter(t => !t.completed && t.scheduled_date).forEach(task => {
    lines.push("BEGIN:VEVENT", `UID:${escapeICS(task.id)}@study-buddy`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${task.scheduled_date!.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${addDays(task.scheduled_date!, 1).replaceAll("-", "")}`,
      `SUMMARY:${escapeICS(task.title)}`, `DESCRIPTION:${escapeICS(task.description || "Study session")}`,
      "BEGIN:VALARM", "TRIGGER:-PT15H", "ACTION:DISPLAY", "DESCRIPTION:Study tomorrow", "END:VALARM", "END:VEVENT");
  });
  lines.push("END:VCALENDAR"); return lines.map(fold).join("\r\n") + "\r\n";
}
