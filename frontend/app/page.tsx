"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [studyTime, setStudyTime] = useState("");
  const [knowledgeLevel, setKnowledgeLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const goalRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);
  const studyTimeRef = useRef<HTMLInputElement>(null);
  const knowledgeLevelRef = useRef<HTMLSelectElement>(null);

async function generateStudyPlan() {
  try {
    setLoading(true);
    setMessage("");
    setError(false);
    if (!goal) {
      setError(true);
      setMessage("Please enter what you want to learn.");
      goalRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      goalRef.current?.focus();
      setLoading(false);
      return;
    }

    if (!deadline) {
      setError(true);
      setMessage("Please select your deadline.");
      deadlineRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      deadlineRef.current?.focus();
      setLoading(false);
      return;
    }

    if (!studyTime) {
      setError(true);
      setMessage("Please enter how many hours you can study each day.");
      studyTimeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      studyTimeRef.current?.focus();
      setLoading(false);
      return;
    }

    if (!knowledgeLevel) {
      setError(true);
      setMessage("Please select your current experience level.");
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
      setMessage("Study time must be greater than 0 hours.");
      studyTimeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      studyTimeRef.current?.focus();
      setLoading(false);
      return;
    }
    const response = await fetch("http://127.0.0.1:8000/generate-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        goal: goal,
        deadline: deadline,
        study_time: studyTime,
        knowledge_level: knowledgeLevel,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      setError(true);
      setMessage(
        data.message || "Unable to generate your study plan. Please try again."
      );
    } else {
      setError(false);
      setMessage(data.study_plan);
    }
  } catch (error) {
    setMessage("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
}

  return (
    <main className="container">
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
            Tell us what you want to learn, and we'll build a personalized plan for you.
          </p>
      <label>What do you want to learn?</label>
      <input
        ref={goalRef}
        type="text"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="What do you want to learn?"
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
        value={studyTime}
        onChange={(event) => setStudyTime(event.target.value)}
        placeholder="How many hours can you study per day?"
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

    {loading ? (
      <div className="loading-card">
        <p>Generating your personalized study plan...</p>
      </div>
    ) : message ? (
      error ? (
        <div className="error-card">
          <p>{message}</p>
        </div>
      ) : (
        <section className="results-card">
          <h2>Your Study Plan</h2>
          <ReactMarkdown>{message}</ReactMarkdown>
        </section>
      )
    ) : null}
    </main>
  );
}