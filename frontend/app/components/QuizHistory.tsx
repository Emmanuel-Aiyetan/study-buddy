"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Attempt = { id: string; score: number; total: number; created_at: string; review_questions: string[] };
export default function QuizHistory({ planId, revision = 0 }: { planId?: string; revision?: number }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [message, setMessage] = useState("Loading quiz history…");
  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setMessage("Log in to view quiz history."); return; }
      let query = supabase.from("quiz_attempts").select("id,score,total,created_at,review_questions").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      if (planId) query = query.eq("study_plan_id", planId);
      const { data, error } = await query;
      if (active) { setAttempts(data || []); setMessage(error ? "Quiz history is unavailable. Check that the database migration has been installed." : ""); }
    }
    load().catch(() => { if (active) setMessage("Unable to load quiz history. Refresh to try again."); });
    return () => { active = false; };
  }, [planId, revision]);
  return <section className="feature-card"><h2>Quiz progress & review</h2>
    <p>Latest 20 attempts. Use missed questions to guide your next study session.</p>
    {message && <p role="status">{message}</p>}
    {!message && !attempts.length && <p>Complete a quiz to start tracking your understanding.</p>}
    {attempts.map(a => <details key={a.id}><summary>{new Date(a.created_at).toLocaleDateString()} · {a.score}/{a.total} ({Math.round(a.score / a.total * 100)}%)</summary>
      {a.review_questions.length ? <ul>{a.review_questions.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p>All questions answered correctly.</p>}
    </details>)}
  </section>;
}
