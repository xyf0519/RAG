import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";

import { LoginScreen } from "./login-screen";

describe("LoginScreen", () => {
  it("renders customer-facing role entry points", () => {
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    expect(screen.getByRole("heading", { name: "xyfRAG" })).toBeInTheDocument();
    expect(screen.getByText("管理员入口")).toBeInTheDocument();
    expect(screen.getByText("用户入口")).toBeInTheDocument();
    expect(screen.queryByText(/Demo|Preview|下一阶段|演示版/)).not.toBeInTheDocument();
  });

  it("signs in with the selected role", () => {
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /用户入口/ }));

    expect(window.localStorage.getItem("xyfrag.auth.v1")).toContain("知识库用户");
  });
});
