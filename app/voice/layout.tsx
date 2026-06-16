import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Voice notes to text",
  description:
    "Turn a short voice note into clean, exact text. Record or upload audio and get a transcript you can paste into Claude, ChatGPT, Gemini, or any AI tool. Free and runs on-demand.",
};

export default function VoiceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
