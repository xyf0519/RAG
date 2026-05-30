import type { Metadata } from "next";

import { AuthProvider } from "@/features/auth/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "xyfRAG",
  description: "Campus RAG assistant with grounded citations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
