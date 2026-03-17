import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";

export const metadata: Metadata = {
  title: "Otter Clone - AI Transcription",
  description: "Transcribe audio files with AI-powered summaries",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
