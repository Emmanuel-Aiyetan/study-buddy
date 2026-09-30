"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type StudyPlan = {
  id: string;
  title: string;
  goal: string;
  deadline: string | null;
  knowledge_level: string | null;
  study_time: number | null;
  status: string;
  created_at: string;
};

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

export default function DashboardPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [fullName, setFullName] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Get the currently logged-in user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        // Get user's profile
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error("Profile error:", profileError);
        } else {
          setFullName(profile?.full_name || "");
        }

        // Get user's study plans
        const { data: studyPlans, error: plansError } = await supabase
          .from("study_plans")
          .select("*")
          .order("created_at", { ascending: false });

        if (plansError) {
          console.error("Study plans error:", plansError);
          setError("Unable to load your study plans.");
          return;
        }

        setPlans(studyPlans || []);

        // Get tasks belonging to the user's plans
        if (studyPlans && studyPlans.length > 0) {
          const planIds = studyPlans.map((plan) => plan.id);

          const { data: studyTasks, error: tasksError } = await supabase
            .from("study_tasks")
            .select("*")
            .in("study_plan_id", planIds)
            .order("scheduled_date", { ascending: true });

          if (tasksError) {
            console.error("Study tasks error:", tasksError);
            setError("Your plans loaded, but your tasks could not be loaded.");
            return;
          }

          setTasks(studyTasks || []);
        }
      } catch (error) {
        console.error("Dashboard error:", error);
        setError("Something went wrong while loading your dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function getPlanTasks(planId: string) {
    return tasks.filter((task) => task.study_plan_id === planId);
  }

  function getProgress(planId: string) {
    const planTasks = getPlanTasks(planId);

    if (planTasks.length === 0) {
      return 0;
    }

    const completedTasks = planTasks.filter(
      (task) => task.completed
    ).length;

    return Math.round((completedTasks / planTasks.length) * 100);
  }

  async function toggleTask(task: StudyTask) {
  const newCompletedStatus = !task.completed;

  const { error } = await supabase
    .from("study_tasks")
    .update({
      completed: newCompletedStatus,
      completed_at: newCompletedStatus ? new Date().toISOString() : null,
    })
    .eq("id", task.id);

  if (error) {
    console.error("Task update error:", error);
    setError("Unable to update this task. Please try again.");
    return;
  }

  setTasks((currentTasks) =>
    currentTasks.map((currentTask) =>
      currentTask.id === task.id
        ? {
            ...currentTask,
            completed: newCompletedStatus,
            completed_at: newCompletedStatus
              ? new Date().toISOString()
              : null,
          }
        : currentTask
    )
  );

  setError("");
}

  function getOverallProgress() {
    if (tasks.length === 0) {
      return 0;
    }

    const completedTasks = tasks.filter((task) => task.completed).length;

    return Math.round((completedTasks / tasks.length) * 100);
  }

  function getTodayTasks() {
    const today = new Date().toISOString().split("T")[0];

    return tasks.filter((task) => task.scheduled_date === today);
  }
  function getStudyDays() {
    const completedDates = tasks
      .filter((task) => task.completed && task.completed_at)
      .map((task) => task.completed_at!.split("T")[0]);

    return [...new Set(completedDates)].sort().reverse();
  }

  function getCurrentStreak() {
    const studyDays = getStudyDays();

    if (studyDays.length === 0) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mostRecentStudyDay = new Date(`${studyDays[0]}T00:00:00`);

    const daysSinceMostRecentStudy = Math.floor(
      (today.getTime() - mostRecentStudyDay.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // If the user hasn't studied today or yesterday,
    // their current streak has ended.
    if (daysSinceMostRecentStudy > 1) {
      return 0;
    }

    let streak = 0;
    let expectedDate = new Date(mostRecentStudyDay);

    for (const studyDay of studyDays) {
      const currentDate = new Date(`${studyDay}T00:00:00`);

      const difference = Math.floor(
        (expectedDate.getTime() - currentDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (difference === 0) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  function getBestStreak() {
    const studyDays = getStudyDays();

    if (studyDays.length === 0) {
      return 0;
    }

    const sortedDates = [...studyDays].sort();

    let bestStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const previousDate = new Date(`${sortedDates[i - 1]}T00:00:00`);
      const currentDate = new Date(`${sortedDates[i]}T00:00:00`);

      const difference = Math.floor(
        (currentDate.getTime() - previousDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (difference === 1) {
        currentStreak++;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return bestStreak;
  }
  if (loading) {
    return (
      <main className="container">
        <div className="loading-card">
          <p>Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="hero">
        <p className="eyebrow">AI STUDY BUDDY</p>

        <h1>
          Welcome back{fullName ? `, ${fullName}` : ""} 👋
        </h1>

        <p className="subtitle">
          Stay consistent, track your progress, and reach your learning goals.
        </p>
      </section>

      <section className="dashboard-actions">
        <button onClick={() => router.push("/")}>
          + Create New Study Plan
        </button>

        <button className="logout-button" onClick={handleLogout}>
          Log Out
        </button>
      </section>

      {error && (
        <div className="error-card">
          <p>{error}</p>
        </div>
      )}

      <section className="dashboard-section">
        <div className="section-header">
          <h2>Your Study Plans</h2>

          <span>
            {plans.length} {plans.length === 1 ? "plan" : "plans"}
          </span>
        </div>

        {plans.length === 0 ? (
          <div className="empty-card">
            <h3>No study plans yet</h3>

            <p>
              Create your first personalized study plan and start learning.
            </p>

            <button onClick={() => router.push("/")}>
              Create Your First Plan
            </button>
          </div>
        ) : (
          <div className="plans-grid">
            {plans.map((plan) => {
              const progress = getProgress(plan.id);
              const planTasks = getPlanTasks(plan.id);

              return (
                <article className="plan-card" key={plan.id}>
                  <h3>{plan.title}</h3>

                  <p className="plan-goal">{plan.goal}</p>

                  {plan.deadline && (
                    <p>
                      <strong>Deadline:</strong> {plan.deadline}
                    </p>
                  )}

                  <p>
                    <strong>Level:</strong>{" "}
                    {plan.knowledge_level || "Not specified"}
                  </p>

                  <div className="progress-info">
                    <span>Progress</span>
                    <strong>{progress}%</strong>
                  </div>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="task-count">
                    {planTasks.filter((task) => task.completed).length} of{" "}
                    {planTasks.length} tasks completed
                  </p>
                  <button
                    className="view-plan-button"
                    onClick={() => router.push(`/plans/${plan.id}`)}
                  >
                    View Plan →
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="streak-card">
        <div className="streak-main">
          <span className="streak-icon">🔥</span>

          <div>
            <h2>{getCurrentStreak()} Day Streak</h2>

            <p>
              {getCurrentStreak() === 0
                ? "Complete a task today to start your streak."
                : "Keep it going! Consistency is the key."}
            </p>
          </div>
        </div>

        <div className="streak-best">
          <span>Best Streak</span>
          <strong>{getBestStreak()} days</strong>
        </div>
      </section>
      <section className="overall-progress-card">
        <div className="progress-info">
          <span>Overall Progress</span>
          <strong>{getOverallProgress()}%</strong>
        </div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getOverallProgress()}%` }}
          />
        </div>

        <p>
          {tasks.filter((task) => task.completed).length} of {tasks.length} tasks
          completed
        </p>
      </section>
      <section className="dashboard-section">
        <div className="section-header">
          <h2>Today's Tasks</h2>

          <span>{getTodayTasks().length} today</span>
        </div>

        {getTodayTasks().length === 0 ? (
          <div className="empty-card">
            <h3>No tasks for today 🎉</h3>
            <p>You're all caught up. Enjoy your day or get ahead on your plan.</p>
          </div>
        ) : (
          <div className="tasks-list">
            {getTodayTasks().map((task) => (
              <div
                className={`task-card ${
                  task.completed ? "task-completed" : ""
                }`}
                key={task.id}
              >
                <div className="task-content">
                  <button
                    className={`task-checkbox ${
                      task.completed ? "task-checkbox-completed" : ""
                    }`}
                    onClick={() => toggleTask(task)}
                    aria-label={
                      task.completed
                        ? "Mark task incomplete"
                        : "Mark task complete"
                    }
                  >
                    {task.completed ? "✓" : ""}
                  </button>

                  <div>
                    <h3>{task.title}</h3>

                    {task.description && <p>{task.description}</p>}
                  </div>
                </div>

                <div className="task-meta">
                  {task.estimated_minutes && (
                    <span>{task.estimated_minutes} min</span>
                  )}

                  <span>
                    {task.completed ? "Completed" : "Not completed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="dashboard-section">
        <div className="section-header">
          <h2>Your Tasks</h2>

          <span>{tasks.length} total</span>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-card">
            <p>You don't have any study tasks yet.</p>
          </div>
        ) : (
          <div className="tasks-list">
            {tasks.map((task) => (
              <div
                className={`task-card ${task.completed ? "task-completed" : ""}`}
                key={task.id}
              >
                <div className="task-content">
                  <button
                    className={`task-checkbox ${
                      task.completed ? "task-checkbox-completed" : ""
                    }`}
                    onClick={() => toggleTask(task)}
                    aria-label={
                      task.completed ? "Mark task incomplete" : "Mark task complete"
                    }
                  >
                    {task.completed ? "✓" : ""}
                  </button>

                  <div>
                    <h3>{task.title}</h3>

                    {task.description && <p>{task.description}</p>}
                  </div>
                </div>

                <div className="task-meta">
                  {task.scheduled_date && <span>{task.scheduled_date}</span>}

                  {task.estimated_minutes && (
                    <span>{task.estimated_minutes} min</span>
                  )}

                  <span>
                    {task.completed ? "Completed" : "Not completed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}