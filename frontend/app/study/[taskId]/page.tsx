"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type StudyTask = {
  id: string;
  study_plan_id: string;
  title: string;
  description: string | null;
  scheduled_date: string | null;
  estimated_minutes: number | null;
  completed: boolean;
  completed_at: string | null;
};

export default function StudySessionPage() {
  const params = useParams();
  const router = useRouter();

  const taskId = params.taskId as string;

  const [task, setTask] = useState<StudyTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    async function loadTask() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        const { data: studyTask, error: taskError } = await supabase
          .from("study_tasks")
          .select(`
            *,
            study_plans!inner(user_id)
          `)
          .eq("id", taskId)
          .eq("study_plans.user_id", user.id)
          .single();

        if (taskError || !studyTask) {
          console.error("Study task error:", taskError);
          setError("Unable to find this study task.");
          return;
        }

        setTask(studyTask);
      } catch (error) {
        console.error("Study session error:", error);
        setError("Something went wrong while loading this task.");
      } finally {
        setLoading(false);
      }
    }

    if (taskId) {
      loadTask();
    }
  }, [taskId, router]);

  useEffect(() => {
    if (!timerRunning) {
        return;
    }

    const timer = setInterval(() => {
        setSeconds((currentSeconds) => currentSeconds + 1);
    }, 1000);

    return () => clearInterval(timer);
    }, [timerRunning]);

    function formatTime(totalSeconds: number) {
        const minutes = Math.floor(totalSeconds / 60);
        const remainingSeconds = totalSeconds % 60;

        return `${String(minutes).padStart(2, "0")}:${String(
            remainingSeconds
        ).padStart(2, "0")}`;
        }
  async function completeTask() {
    if (!task) {
      return;
    }

    setCompleting(true);
    setError("");

    const completedAt = new Date().toISOString();

    const { error } = await supabase
      .from("study_tasks")
      .update({
        completed: true,
        completed_at: completedAt,
      })
      .eq("id", task.id);

    if (error) {
      console.error("Task completion error:", error);
      setError("Unable to complete this task. Please try again.");
      setCompleting(false);
      return;
    }

    setTask({
        ...task,
        completed: true,
        completed_at: completedAt,
        });

        setCompleting(false);

        setTimeout(() => {
        router.push(`/plans/${task.study_plan_id}`);
        }, 1000);
  }

  if (loading) {
    return (
      <main className="container">
        <div className="loading-card">
          <p>Loading your study session...</p>
        </div>
      </main>
    );
  }

  if (error || !task) {
    return (
      <main className="container">
        <button
          className="back-button"
          onClick={() => router.push("/dashboard")}
        >
          ← Back to Dashboard
        </button>

        <div className="error-card">
          <p>{error || "Study task not found."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <button
        className="back-button"
        onClick={() => router.push(`/plans/${task.study_plan_id}`)}
      >
        ← Back to Study Plan
      </button>

      <section className="study-session-card">
        <p className="eyebrow">STUDY SESSION</p>

        <h1>{task.title}</h1>

        {task.description && (
          <p className="study-session-description">
            {task.description}
          </p>
        )}

        <div className="study-session-details">
          {task.estimated_minutes && (
            <div>
              <span>Estimated Time</span>
              <strong>{task.estimated_minutes} minutes</strong>
            </div>
          )}

          {task.scheduled_date && (
            <div>
              <span>Scheduled For</span>
              <strong>{task.scheduled_date}</strong>
            </div>
          )}
        </div>
        <div className="study-timer">
         <span className="timer-label">Study Time</span>

         <strong>{formatTime(seconds)}</strong>

         <button
             className="timer-button"
             onClick={() => setTimerRunning(!timerRunning)}
         >
             {timerRunning ? "Pause" : "Start Timer"}
         </button>
        </div>
        <div className="study-session-instructions">
          <h2>Today's Focus</h2>

          <p>
            Focus on completing this task without distractions. Take your
            time, understand the material, and make notes of anything you
            don't understand.
          </p>

          <p>
            When you're finished, mark the task as complete so Study Buddy
            can update your progress.
          </p>
        </div>

        {task.completed ? (
          <div className="success-card">
            <p>✓ Task completed! Great work.</p>
          </div>
        ) : (
          <button
            onClick={completeTask}
            disabled={completing}
          >
            {completing ? "Saving..." : "Mark Task Complete"}
          </button>
        )}
      </section>
    </main>
  );
}