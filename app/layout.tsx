import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";

export const metadata: Metadata = {
  title: "seaotter",
  description: "Transcribe audio files with AI-powered summaries",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 antialiased">
        <Sidebar />
        <TopBar />
        <main className="ml-60 mt-16 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
