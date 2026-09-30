"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type Milestone = {
  title: string;
  description: string;
};

type StudyTask = {
  title: string;
  description: string;
  scheduled_date: string;
  estimated_minutes: number;
};

type StudyPlan = {
  title: string;
  goal: string;
  deadline: string;
  knowledge_level: string;
  study_time: number;
  milestones: Milestone[];
  tasks: StudyTask[];
};

export default function Home() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [studyTime, setStudyTime] = useState("");
  const [knowledgeLevel, setKnowledgeLevel] = useState("");
  const [loading, setLoading] = useState(false);

  const goalRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);
  const studyTimeRef = useRef<HTMLInputElement>(null);
  const knowledgeLevelRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
      setAuthLoading(false);
    }

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  async function handleLogout() {
    await supabase.auth.signOut();

    setUser(null);
    router.push("/login");
  }
  async function generateStudyPlan() {
    try {
      setLoading(true);
      setStudyPlan(null);
      setError(false);
      setErrorMessage("");
      setSuccessMessage("");

      // Validate goal
      if (!goal) {
        setError(true);
        setErrorMessage("Please enter what you want to learn.");

        goalRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        goalRef.current?.focus();
        setLoading(false);
        return;
      }

      // Validate deadline
      if (!deadline) {
        setError(true);
        setErrorMessage("Please select your deadline.");

        deadlineRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        deadlineRef.current?.focus();
        setLoading(false);
        return;
      }

      // Validate study time
      if (!studyTime) {
        setError(true);
        setErrorMessage("Please enter how many hours you can study each day.");

        studyTimeRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        studyTimeRef.current?.focus();
        setLoading(false);
        return;
      }

      // Validate knowledge level
      if (!knowledgeLevel) {
        setError(true);
        setErrorMessage("Please select your current experience level.");

        knowledgeLevelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        knowledgeLevelRef.current?.focus();
        setLoading(false);
        return;
      }

      if (Number(studyTime) <= 0) {
        setError(true);
        setErrorMessage("Study time must be greater than 0 hours.");
        setLoading(false);
        return;
      }

      // Check that the user is logged in
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError(true);
        setErrorMessage("Please log in before creating a study plan.");
        router.push("/login");
        return;
      }

      // Generate the plan with FastAPI + Gemini
      const response = await fetch("${process.env.NEXT_PUBLIC_API_URL}/generate-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal,
          deadline,
          study_time: Number(studyTime),
          knowledge_level: knowledgeLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(true);
        setErrorMessage(
          data.message ||
            "Unable to generate your study plan. Please try again."
        );
        return;
      }

      const generatedPlan: StudyPlan = data.study_plan;

      // Save the study plan to Supabase
      const { data: savedPlan, error: planError } = await supabase
        .from("study_plans")
        .insert({
          user_id: user.id,
          title: generatedPlan.title,
          goal: generatedPlan.goal,
          deadline: generatedPlan.deadline,
          knowledge_level: generatedPlan.knowledge_level,
          study_time: generatedPlan.study_time,
          status: "active",
        })
        .select()
        .single();

      if (planError || !savedPlan) {
        console.error("Study plan save error:", {
        message: planError?.message,
        details: planError?.details,
        hint: planError?.hint,
        code: planError?.code,
      });

      setError(true);

      setErrorMessage(
        planError?.message ||
          "The study plan was generated, but we couldn't save it. Please try again."
      );

      return;
    }

      // Save all generated tasks
      const tasksToInsert = generatedPlan.tasks.map((task) => ({
        study_plan_id: savedPlan.id,
        title: task.title,
        description: task.description,
        scheduled_date: task.scheduled_date,
        estimated_minutes: task.estimated_minutes,
        completed: false,
      }));

      const { error: tasksError } = await supabase
        .from("study_tasks")
        .insert(tasksToInsert);

      // If tasks fail to save, remove the study plan we just created
      if (tasksError) {
        console.error("Study tasks save error:", tasksError);

        await supabase
          .from("study_plans")
          .delete()
          .eq("id", savedPlan.id);

        setError(true);
        setErrorMessage(
          "The study plan was generated, but we couldn't save its tasks. Please try again."
        );
        return;
      }

      // Everything succeeded
      setStudyPlan(generatedPlan);
      setSuccessMessage("Study plan saved successfully!");
    } catch (error) {
      console.error("Generate plan error:", error);

      setError(true);
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <nav className="home-nav">
        <button
          className="home-nav-brand"
          onClick={() => router.push("/")}
        >
          Study Buddy
        </button>

        {!authLoading && (
          <div className="home-nav-actions">
            {user ? (
              <>
                <button
                  className="nav-dashboard-button"
                  onClick={() => router.push("/dashboard")}
                >
                  Dashboard
                </button>

                <button
                  className="nav-logout-button"
                  onClick={handleLogout}
                >
                  Log Out
                </button>
              </>
            ) : (
              <button
                className="nav-login-button"
                onClick={() => router.push("/login")}
              >
                Log In
              </button>
            )}
          </div>
        )}
      </nav>
      <section className="hero">
        <p className="eyebrow">AI-POWERED LEARNING</p>

        <h1>AI Study Buddy</h1>

        <p className="subtitle">
          Turn your learning goals into a personalized study plan.
        </p>
      </section>

      <section className="form-card">
        <h2>Create your study plan</h2>

        <p>
          Tell us what you want to learn, and we'll build a personalized plan
          for you.
        </p>

        <label>What do you want to learn?</label>

        <input
          ref={goalRef}
          type="text"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="For example: Learn Python for backend development"
        />

        <label>When do you want to reach your goal?</label>

        <input
          ref={deadlineRef}
          type="date"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />

        <label>How much time can you study each day?</label>

        <input
          ref={studyTimeRef}
          type="number"
          min="0"
          step="0.5"
          value={studyTime}
          onChange={(event) => setStudyTime(event.target.value)}
          placeholder="How many hours per day?"
        />

        <label>What's your current experience level?</label>

        <select
          ref={knowledgeLevelRef}
          value={knowledgeLevel}
          onChange={(event) => setKnowledgeLevel(event.target.value)}
        >
          <option value="">Select your current knowledge level</option>
          <option value="Beginner">Beginner</option>
          <option value="Some experience">Some experience</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option>
        </select>

        <button onClick={generateStudyPlan} disabled={loading}>
          {loading ? "Generating..." : "Generate Study Plan"}
        </button>
      </section>

      {loading && (
        <div className="loading-card">
          <p>Generating and saving your personalized study plan...</p>
        </div>
      )}

      {error && (
        <div className="error-card">
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && !error && (
        <div className="success-card">
          <p>{successMessage}</p>
        </div>
      )}

      {studyPlan && (
        <section className="results-card">
          <h2>{studyPlan.title}</h2>

          <p>
            <strong>Goal:</strong> {studyPlan.goal}
          </p>

          <p>
            <strong>Deadline:</strong> {studyPlan.deadline}
          </p>

          <p>
            <strong>Experience:</strong> {studyPlan.knowledge_level}
          </p>

          <p>
            <strong>Study time:</strong> {studyPlan.study_time} hours/day
          </p>

          <hr />

          <h3>Milestones</h3>

          {studyPlan.milestones.map((milestone, index) => (
            <div key={index}>
              <h4>
                {index + 1}. {milestone.title}
              </h4>

              <p>{milestone.description}</p>
            </div>
          ))}

          <hr />

          <h3>Study Tasks</h3>

          {studyPlan.tasks.map((task, index) => (
            <div key={index}>
              <h4>
                {index + 1}. {task.title}
              </h4>

              <p>{task.description}</p>

              <p>
                <strong>Date:</strong> {task.scheduled_date}
              </p>

              <p>
                <strong>Estimated time:</strong>{" "}
                {task.estimated_minutes} minutes
              </p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}