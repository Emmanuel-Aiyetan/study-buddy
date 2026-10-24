"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { adaptSchedule, localDay, type Task } from "../../lib/planning";

export default function AdaptivePlan({ plan, tasks, onApplied }: {
  plan: { id: string; deadline: string | null; study_time: number | null };
  tasks: Task[]; onApplied: () => Promise<void>;
}) {
  const [hours, setHours] = useState(String(plan.study_time || 1));
  const [deadline, setDeadline] = useState(plan.deadline || localDay());
  const [preview, setPreview] = useState<ReturnType<typeof adaptSchedule> | null>(null);
  const [snapshot, setSnapshot] = useState<Task[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  function prepare() {
    setMessage(""); setPreview(null);
    try { setPreview(adaptSchedule(tasks, localDay(), deadline, Number(hours))); setSnapshot(tasks); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to prepare your schedule."); }
  }
  async function apply() {
    if (!preview || saving) return;
    setSaving(true); setMessage("");
    try {
      const { error } = await supabase.rpc("adapt_study_plan", {
        p_plan_id: plan.id, p_deadline: deadline, p_hours: Number(hours), p_today: localDay(),
        p_expected: snapshot.map(t => ({ id: t.id, scheduled_date: t.scheduled_date, completed: t.completed, estimated_minutes: t.estimated_minutes })),
        p_schedule: preview,
      });
      if (error) throw new Error("Could not save the schedule. Refresh and try again. The adaptive-plan database migration must be installed.");
      setPreview(null); await onApplied(); setMessage("Your remaining tasks have been rescheduled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save your schedule."); }
    finally { setSaving(false); }
  }
  return <section className="feature-card" aria-labelledby="adapt-heading">
    <h2 id="adapt-heading">Adapt your study plan</h2>
    <p>Catch up on missed work or change your availability. Earlier tasks come first, completed work stays in place, and each day fits your study time.</p>
    <div className="feature-controls">
      <label>Hours per day<input type="number" min="0.25" max="12" step="0.25" value={hours} disabled={saving} onChange={e => { setHours(e.target.value); setPreview(null); }} /></label>
      <label>Deadline<input type="date" min={localDay()} value={deadline} disabled={saving} onChange={e => { setDeadline(e.target.value); setPreview(null); }} /></label>
      <button onClick={prepare} disabled={saving || tasks.every(t => t.completed)}>Preview schedule</button>
    </div>
    {preview && <><p>{preview.length} remaining tasks. Review the dates before saving.</p><ul className="schedule-preview">
      {preview.map(item => <li key={item.id}><span>{tasks.find(t => t.id === item.id)?.title}</span><time>{item.scheduled_date}</time></li>)}
    </ul><button onClick={apply} disabled={saving}>{saving ? "Saving…" : "Apply schedule"}</button><button disabled={saving} onClick={() => setPreview(null)}>Cancel</button></>}
    <p role="status">{message}</p>
  </section>;
}
