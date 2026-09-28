import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Codesphere | AI-Powered Repository Analysis & Conversational Code Assistant",
  description: "Analyze code repositories, explore project structure, and chat with your codebase using AI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
