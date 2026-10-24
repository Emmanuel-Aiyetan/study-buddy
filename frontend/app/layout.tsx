import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Study Buddy",
  description: "Personalized study plans, contextual tutoring, quizzes, and learning progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
