"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

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
type StudyMaterial = {
  id: string;
  user_id: string;
  study_plan_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

export default function StudyPlanPage() {
  const params = useParams();
  const router = useRouter();

  const planId = params.id as string;

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [analyzingMaterialId, setAnalyzingMaterialId] = useState<string | null>(
    null
  );

  const [materialAnalyses, setMaterialAnalyses] = useState<
    Record<
      string,
      {
        summary: string;
        key_concepts: string[];
        focus_areas: string[];
      }
    >
  >({});
  const [tutorQuestions, setTutorQuestions] = useState<
    Record<string, string>
  >({});

  const [tutorMessages, setTutorMessages] = useState<
    Record<
      string,
      {
        role: "student" | "tutor";
        content: string;
      }[]
    >
  >({});

  const [tutorLoadingMaterialId, setTutorLoadingMaterialId] =
    useState<string | null>(null);
  const [materialQuizzes, setMaterialQuizzes] = useState<
    Record<
      string,
      {
        title: string;
        questions: {
          question: string;
          options: string[];
          correct_answer: number;
          explanation: string;
        }[];
      }
    >
  >({});

  const [quizLoadingMaterialId, setQuizLoadingMaterialId] =
    useState<string | null>(null);

  const [quizAnswers, setQuizAnswers] = useState<
    Record<string, Record<number, number>>
  >({});

  const [submittedQuizzes, setSubmittedQuizzes] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  useEffect(() => {
    async function loadPlan() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        const { data: studyPlan, error: planError } = await supabase
          .from("study_plans")
          .select("*")
          .eq("id", planId)
          .eq("user_id", user.id)
          .single();

        if (planError || !studyPlan) {
          console.error("Study plan error:", planError);
          setError("Unable to find this study plan.");
          return;
        }

        setPlan(studyPlan);

        const { data: studyTasks, error: tasksError } = await supabase
          .from("study_tasks")
          .select("*")
          .eq("study_plan_id", planId)
          .order("scheduled_date", { ascending: true });

        if (tasksError) {
          console.error("Study tasks error:", tasksError);
          setError("The study plan loaded, but its tasks could not be loaded.");
          return;
        }

        setTasks(studyTasks || []);
        const { data: studyMaterials, error: materialsError } = await supabase
          .from("study_materials")
          .select("*")
          .eq("study_plan_id", planId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (materialsError) {
          console.error("Study materials error:", materialsError);
          setError(
            "Your plan loaded, but your study materials could not be loaded."
          );
          return;
        }

        setMaterials(studyMaterials || []);
      } catch (error) {
        console.error("Plan page error:", error);
        setError("Something went wrong while loading this study plan.");
      } finally {
        setLoading(false);
      }
    }

    if (planId) {
      loadPlan();
    }
  }, [planId, router]);

  async function toggleTask(task: StudyTask) {
    const newCompletedStatus = !task.completed;
    const completedAt = newCompletedStatus
      ? new Date().toISOString()
      : null;

    const { error } = await supabase
      .from("study_tasks")
      .update({
        completed: newCompletedStatus,
        completed_at: completedAt,
      })
      .eq("id", task.id)
      .eq("study_plan_id", planId);

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
              completed_at: completedAt,
            }
          : currentTask
      )
    );

    setError("");
  }
  async function uploadMaterial(file: File) {
    setUploading(true);
    setUploadMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setUploadMessage("Please log in before uploading a file.");
        return;
      }

      const fileExtension = file.name.split(".").pop()?.toLowerCase();

      if (fileExtension !== "pdf") {
        setUploadMessage("Please upload a PDF file.");
        return;
      }

      const filePath = `${user.id}/${planId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("study-materials")
        .upload(filePath, file);

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        setUploadMessage("Unable to upload the file. Please try again.");
        return;
      }

      const { error: databaseError } = await supabase
        .from("study_materials")
        .insert({
          user_id: user.id,
          study_plan_id: planId,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
        });

      if (databaseError) {
        console.error("Material database error:", databaseError);

        await supabase.storage
          .from("study-materials")
          .remove([filePath]);

        setUploadMessage(
          "The file uploaded, but we couldn't save its information."
        );
        return;
      }

      setUploadMessage("Material uploaded successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      setUploadMessage("Something went wrong while uploading.");
    } finally {
      setUploading(false);
    }
  }
  async function analyzeMaterial(material: StudyMaterial) {
    setAnalyzingMaterialId(material.id);
    setUploadMessage("");

    try {
      // Download the private PDF from Supabase Storage
      const { data: fileBlob, error: downloadError } =
        await supabase.storage
          .from("study-materials")
          .download(material.file_path);

      if (downloadError || !fileBlob) {
        console.error("Material download error:", downloadError);
        setUploadMessage("Unable to download this material for analysis.");
        return;
      }

      // Create form data so the PDF can be sent to FastAPI
      const formData = new FormData();

      formData.append(
        "file",
        fileBlob,
        material.file_name
      );

      // Send the PDF to our FastAPI backend
      const response = await fetch(
        "http://127.0.0.1:8000/extract-pdf",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.analysis) {
        console.error("Material analysis error:", data);

        setUploadMessage(
          data.message || "Unable to analyze this material."
        );

        return;
      }

      // Save this material's analysis in React state
      setMaterialAnalyses((currentAnalyses) => ({
        ...currentAnalyses,
        [material.id]: data.analysis,
      }));

      setUploadMessage("Material analyzed successfully!");
    } catch (error) {
      console.error("Material analysis error:", error);

      setUploadMessage(
        "Something went wrong while analyzing the material."
      );
    } finally {
      setAnalyzingMaterialId(null);
    }
  }

  async function askTutor(material: StudyMaterial) {
    const question = tutorQuestions[material.id]?.trim();

    if (!question) {
      return;
    }

    setTutorLoadingMaterialId(material.id);

    // Add the student's question to the conversation
    setTutorMessages((currentMessages) => ({
      ...currentMessages,
      [material.id]: [
        ...(currentMessages[material.id] || []),
        {
          role: "student",
          content: question,
        },
      ],
    }));

    // Clear the question input
    setTutorQuestions((currentQuestions) => ({
      ...currentQuestions,
      [material.id]: "",
    }));

    try {
      // Download the PDF from the private Supabase bucket
      const { data: fileBlob, error: downloadError } =
        await supabase.storage
          .from("study-materials")
          .download(material.file_path);

      if (downloadError || !fileBlob) {
        throw new Error("Unable to download the study material.");
      }

      // Prepare the PDF and question for FastAPI
      const formData = new FormData();

      formData.append(
        "file",
        fileBlob,
        material.file_name
      );

      formData.append("question", question);

      const previousMessages = tutorMessages[material.id] || [];

      const conversationHistory = previousMessages
        .map((message) => {
          const speaker =
            message.role === "student" ? "Student" : "Study Buddy";

          return `${speaker}: ${message.content}`;
        })
        .join("\n\n");

      formData.append(
        "conversation_history",
        conversationHistory
      );

      // Send everything to our tutor endpoint
      const response = await fetch(
        "http://127.0.0.1:8000/ask-tutor",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.answer) {
        throw new Error(
          data.message || "Unable to get a tutor response."
        );
      }

      // Add Gemini's answer to the conversation
      setTutorMessages((currentMessages) => ({
        ...currentMessages,
        [material.id]: [
          ...(currentMessages[material.id] || []),
          {
            role: "tutor",
            content: data.answer,
          },
        ],
      }));
    } catch (error) {
      console.error("Tutor error:", error);

      setTutorMessages((currentMessages) => ({
        ...currentMessages,
        [material.id]: [
          ...(currentMessages[material.id] || []),
          {
            role: "tutor",
            content:
              "I couldn't answer that question right now. Please try again.",
          },
        ],
      }));
    } finally {
      setTutorLoadingMaterialId(null);
    }
  }
  async function generateQuiz(material: StudyMaterial) {
    setQuizLoadingMaterialId(material.id);

    try {
      // Download the private PDF from Supabase Storage
      const { data: fileBlob, error: downloadError } =
        await supabase.storage
          .from("study-materials")
          .download(material.file_path);

      if (downloadError || !fileBlob) {
        throw new Error("Unable to download the study material.");
      }

      // Prepare the PDF for FastAPI
      const formData = new FormData();

      formData.append(
        "file",
        fileBlob,
        material.file_name
      );

      // Send the PDF to our quiz endpoint
      const response = await fetch(
        "http://127.0.0.1:8000/generate-quiz",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.quiz) {
        throw new Error(
          data.message || "Unable to generate quiz."
        );
      }

      // Save this material's quiz in React state
      setMaterialQuizzes((currentQuizzes) => ({
        ...currentQuizzes,
        [material.id]: data.quiz,
      }));

      // Clear any answers from an older quiz
      setQuizAnswers((currentAnswers) => ({
        ...currentAnswers,
        [material.id]: {},
      }));

      // Mark the new quiz as not submitted
      setSubmittedQuizzes((currentSubmitted) => ({
        ...currentSubmitted,
        [material.id]: false,
      }));
    } catch (error) {
      console.error("Quiz generation error:", error);
    } finally {
      setQuizLoadingMaterialId(null);
    }
  }
  function submitQuiz(materialId: string) {
    const quiz = materialQuizzes[materialId];

    if (!quiz) {
      return;
    }

    const answers = quizAnswers[materialId] || {};

    // Make sure every question has been answered
    if (Object.keys(answers).length < quiz.questions.length) {
      alert("Please answer every question before submitting.");
      return;
    }

    setSubmittedQuizzes((currentSubmitted) => ({
      ...currentSubmitted,
      [materialId]: true,
    }));
  }

  function getQuizScore(materialId: string) {
    const quiz = materialQuizzes[materialId];

    if (!quiz) {
      return 0;
    }

    const answers = quizAnswers[materialId] || {};

    return quiz.questions.reduce(
      (score, question, questionIndex) => {
        if (
          answers[questionIndex] ===
          question.correct_answer
        ) {
          return score + 1;
        }

        return score;
      },
      0
    );
  }
  function getProgress() {
    if (tasks.length === 0) {
      return 0;
    }

    const completedTasks = tasks.filter(
      (task) => task.completed
    ).length;

    return Math.round((completedTasks / tasks.length) * 100);
  }

  if (loading) {
    return (
      <main className="container">
        <div className="loading-card">
          <p>Loading your study plan...</p>
        </div>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main className="container">
        <button
          className="back-button"
          onClick={() => router.push("/dashboard")}
        >
          ← Back to Dashboard
        </button>

        <div className="error-card">
          <p>{error || "Study plan not found."}</p>
        </div>
      </main>
    );
  }

  const progress = getProgress();

  return (
    <main className="container">
      <button
        className="back-button"
        onClick={() => router.push("/dashboard")}
      >
        ← Back to Dashboard
      </button>

      <section className="plan-detail-header">
        <p className="eyebrow">STUDY PLAN</p>

        <h1>{plan.title}</h1>

        <p className="plan-detail-goal">{plan.goal}</p>

        <div className="plan-details">
          {plan.deadline && (
            <div>
              <span>Deadline</span>
              <strong>{plan.deadline}</strong>
            </div>
          )}

          <div>
            <span>Level</span>
            <strong>
              {plan.knowledge_level || "Not specified"}
            </strong>
          </div>

          {plan.study_time && (
            <div>
              <span>Study Time</span>
              <strong>{plan.study_time} hrs/day</strong>
            </div>
          )}
        </div>
      </section>

      <section className="overall-progress-card">
        <div className="progress-info">
          <span>Plan Progress</span>
          <strong>{progress}%</strong>
        </div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p>
          {tasks.filter((task) => task.completed).length} of{" "}
          {tasks.length} tasks completed
        </p>
      </section>
      <section className="dashboard-section">
        <div className="section-header">
          <h2>Study Materials</h2>
          <span>PDF files</span>
        </div>

        <div className="material-upload-card">
          <p>
            Upload your study materials so Study Buddy can use them to
            understand what you're learning.
          </p>

          <label className="upload-label" htmlFor="material-upload">
            {uploading ? "Uploading..." : "Choose PDF"}
          </label>

          <input
            id="material-upload"
            type="file"
            accept=".pdf,application/pdf"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                uploadMaterial(file);
              }

              event.target.value = "";
            }}
          />

          {uploadMessage && (
            <p className="upload-message">{uploadMessage}</p>
          )}
        </div>

        {materials.length === 0 ? (
          <div className="empty-card">
            <p>No study materials uploaded yet.</p>
          </div>
        ) : (
          <div className="materials-list">
            {materials.map((material) => (
              <div className="material-card" key={material.id}>
                <div>
                  <h3>📄 {material.file_name}</h3>

                  {material.file_size && (
                    <p>
                      {(material.file_size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </div>

                <button
                  className="view-material-button"
                  onClick={async () => {
                    const { data, error } = await supabase.storage
                      .from("study-materials")
                      .createSignedUrl(material.file_path, 60);

                    if (error || !data?.signedUrl) {
                      setUploadMessage(
                        "Unable to open this study material."
                      );
                      return;
                    }

                    window.open(data.signedUrl, "_blank");
                  }}
                >
                  Open PDF →
                </button>
                <button
                  className="analyze-material-button"
                  onClick={() => analyzeMaterial(material)}
                  disabled={analyzingMaterialId === material.id}
                >
                  {analyzingMaterialId === material.id
                    ? "Analyzing..."
                    : "Analyze with AI"}
                </button>
                {materialAnalyses[material.id] && (
                  <div className="material-analysis">
                    <h3>AI Material Analysis</h3>

                    <div className="analysis-section">
                      <h4>Summary</h4>
                      <p>
                        {materialAnalyses[material.id].summary}
                      </p>
                    </div>

                    <div className="analysis-section">
                      <h4>Key Concepts</h4>

                      <ul>
                        {materialAnalyses[material.id].key_concepts.map(
                          (concept, index) => (
                            <li key={index}>{concept}</li>
                          )
                        )}
                      </ul>
                    </div>

                    <div className="analysis-section">
                      <h4>Focus Areas</h4>

                      <ul>
                        {materialAnalyses[material.id].focus_areas.map(
                          (area, index) => (
                            <li key={index}>{area}</li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                )}
                <div className="ai-tutor">
                  <div className="tutor-header">
                    <div>
                      <h3>AI Tutor</h3>
                      <p>Ask questions about this study material.</p>
                    </div>
                  </div>

                  {tutorMessages[material.id]?.length > 0 && (
                    <div className="tutor-messages">
                      {tutorMessages[material.id].map((message, index) => (
                        <div
                          key={index}
                          className={`tutor-message ${message.role}`}
                        >
                          <strong>
                            {message.role === "student" ? "You" : "Study Buddy"}
                          </strong>

                          <p>{message.content}</p>
                        </div>
                      ))}

                      {tutorLoadingMaterialId === material.id && (
                        <div className="tutor-message tutor">
                          <strong>Study Buddy</strong>
                          <p>Thinking...</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="tutor-input">
                    <input
                      type="text"
                      placeholder="Ask something about this material..."
                      value={tutorQuestions[material.id] || ""}
                      disabled={tutorLoadingMaterialId === material.id}
                      onChange={(event) =>
                        setTutorQuestions((currentQuestions) => ({
                          ...currentQuestions,
                          [material.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          askTutor(material);
                        }
                      }}
                    />

                    <button
                      onClick={() => askTutor(material)}
                      disabled={
                        tutorLoadingMaterialId === material.id ||
                        !tutorQuestions[material.id]?.trim()
                      }
                    >
                      {tutorLoadingMaterialId === material.id
                        ? "Thinking..."
                        : "Ask Tutor"}
                    </button>
                  </div>
                </div>
                <div className="material-quiz">
                  <div className="quiz-header">
                    <div>
                      <h3>Practice Quiz</h3>
                      <p>
                        Test your understanding of this study material.
                      </p>
                    </div>

                    <button
                      onClick={() => generateQuiz(material)}
                      disabled={quizLoadingMaterialId === material.id}
                    >
                      {quizLoadingMaterialId === material.id
                        ? "Generating..."
                        : materialQuizzes[material.id]
                          ? "Generate New Quiz"
                          : "Generate Quiz"}
                    </button>
                  </div>

                  {quizLoadingMaterialId === material.id && (
                    <p className="quiz-status">
                      Study Buddy is creating your quiz...
                    </p>
                  )}

                  {materialQuizzes[material.id] && (
                    <div className="quiz-content">
                      <h4>{materialQuizzes[material.id].title}</h4>

                      {materialQuizzes[material.id].questions.map(
                        (question, questionIndex) => (
                          <div
                            key={questionIndex}
                            className="quiz-question"
                          >
                            <p className="quiz-question-text">
                              <strong>
                                {questionIndex + 1}.
                              </strong>{" "}
                              {question.question}
                            </p>

                            <div className="quiz-options">
                              {question.options.map(
                                (option, optionIndex) => (
                                  <label
                                    key={optionIndex}
                                    className="quiz-option"
                                  >
                                    <input
                                      type="radio"
                                      disabled={submittedQuizzes[material.id]}
                                      name={`quiz-${material.id}-question-${questionIndex}`}
                                      checked={
                                        quizAnswers[material.id]?.[
                                          questionIndex
                                        ] === optionIndex
                                      }
                                      onChange={() => {
                                        setQuizAnswers(
                                          (currentAnswers) => ({
                                            ...currentAnswers,
                                            [material.id]: {
                                              ...(currentAnswers[
                                                material.id
                                              ] || {}),
                                              [questionIndex]:
                                                optionIndex,
                                            },
                                          })
                                        );
                                      }}
                                    />

                                    <span>{option}</span>
                                  </label>
                                )
                              )}
                            </div>
                            {submittedQuizzes[material.id] && (
                              <div className="quiz-explanation">
                                {quizAnswers[material.id]?.[questionIndex] ===
                                question.correct_answer ? (
                                  <p className="quiz-correct">
                                    ✓ Correct
                                  </p>
                                ) : (
                                  <p className="quiz-incorrect">
                                    ✗ Incorrect
                                  </p>
                                )}

                                <p>
                                  <strong>Correct answer:</strong>{" "}
                                  {question.options[question.correct_answer]}
                                </p>

                                <p>
                                  <strong>Explanation:</strong>{" "}
                                  {question.explanation}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      )}
                      {submittedQuizzes[material.id] ? (
                        <div className="quiz-results">
                          <h3>
                            Your Score: {getQuizScore(material.id)} /{" "}
                            {materialQuizzes[material.id].questions.length}
                          </h3>

                          <p>
                            {Math.round(
                              (getQuizScore(material.id) /
                                materialQuizzes[material.id].questions.length) *
                                100
                            )}
                            %
                          </p>

                          <button
                            onClick={() => generateQuiz(material)}
                            disabled={quizLoadingMaterialId === material.id}
                          >
                            Generate New Quiz
                          </button>
                        </div>
                      ) : (
                        <button
                          className="submit-quiz-button"
                          onClick={() => submitQuiz(material.id)}
                        >
                          Submit Quiz
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="dashboard-section">
        <div className="section-header">
          <h2>Study Tasks</h2>
          <span>{tasks.length} total</span>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-card">
            <h3>No tasks yet</h3>
            <p>
              This study plan doesn't have any tasks yet.
            </p>
          </div>
        ) : (
          <div className="tasks-list">
            {tasks.map((task) => (
              <div
                className={`task-card ${
                  task.completed ? "task-completed" : ""
                }`}
                key={task.id}
              >
                <div className="task-content">
                  <button
                    className={`task-checkbox ${
                      task.completed
                        ? "task-checkbox-completed"
                        : ""
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

                    {task.description && (
                      <p>{task.description}</p>
                    )}

                    {!task.completed && (
                      <button
                        className="start-task-button"
                        onClick={() => router.push(`/study/${task.id}`)}
                      >
                        Start Task →
                      </button>
                    )}
                  </div>
                </div>

                <div className="task-meta">
                  {task.scheduled_date && (
                    <span>{task.scheduled_date}</span>
                  )}

                  {task.estimated_minutes && (
                    <span>{task.estimated_minutes} min</span>
                  )}

                  <span>
                    {task.completed
                      ? "Completed"
                      : "Not completed"}
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