"use client";
import { useState } from "react";
import { analytics, calendarFile, localDay, type Task } from "../../lib/planning";

export default function StudyInsights({ tasks }: { tasks: Task[] }) {
  const [month, setMonth] = useState(localDay().slice(0, 7));
  const stats = analytics(tasks);
  const selected = tasks.filter(t => t.scheduled_date?.startsWith(month));
  const groups = [...new Set(selected.map(t => t.scheduled_date!))].sort();
  function download() {
    const url = URL.createObjectURL(new Blob([calendarFile(tasks)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "study-buddy.ics"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <section className="feature-card" aria-labelledby="insights-heading">
      <h2 id="insights-heading">Your learning week</h2>
      <div className="insight-grid"><p><strong>{stats.current}</strong> day streak</p><p><strong>{stats.best}</strong> best streak</p><p><strong>{stats.overdue}</strong> overdue tasks</p><p><strong>{stats.week.reduce((n, d) => n + d.minutes, 0)}</strong> estimated minutes completed</p></div>
      <p>Minutes use task estimates; they are not measured study time.</p>
      <ol className="week-chart" aria-label="Tasks completed over the last seven days">{stats.week.map(day => <li key={day.day}>
        <span>{day.day.slice(5)}</span><meter min={0} max={Math.max(1, ...stats.week.map(d => d.count))} value={day.count}>{day.count}</meter><strong>{day.count}</strong>
      </li>)}</ol>
    </section>
    <section className="feature-card" aria-labelledby="calendar-heading">
      <h2 id="calendar-heading">Study calendar & reminders</h2>
      <p>Import your unfinished tasks into your calendar. Each all-day event includes a reminder for 9 AM the day before; your calendar app controls alert delivery. Export again after changing a schedule.</p>
      <div className="feature-controls"><label>Month<input aria-label="Calendar month" type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
        <button onClick={download} disabled={!tasks.some(t => !t.completed && t.scheduled_date)}>Export calendar with reminders</button></div>
      {!groups.length && <p>No tasks scheduled this month.</p>}
      {groups.map(day => <div className="calendar-day" key={day}><h3><time>{day}</time></h3><ul>{selected.filter(t => t.scheduled_date === day).map(t => <li key={t.id}>{t.completed ? "✓ " : "○ "}{t.title} · {t.estimated_minutes ?? 30} min</li>)}</ul></div>)}
    </section>
  </>;
}
