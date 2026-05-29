import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "xyfRAG",
  description: "Campus RAG assistant with grounded citations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
