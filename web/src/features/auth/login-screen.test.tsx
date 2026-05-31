import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";

import { LoginScreen } from "./login-screen";

describe("LoginScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders ZJU email auth entry points", () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeJsonResponse({ ok: true, user: null })));

    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    expect(screen.getByRole("heading", { name: "xyfRAG" })).toBeInTheDocument();
    expect(screen.getByText("浙大邮箱登录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "忘记密码" })).toBeInTheDocument();
    expect(screen.queryByText(/Demo|Preview|下一阶段|演示版/)).not.toBeInTheDocument();
  });

  it("signs in with email and password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/session")) {
          return makeJsonResponse({ ok: true, user: null });
        }
        if (url.includes("/api/auth/login")) {
          return makeJsonResponse({
            ok: true,
            user: {
              id: "user-1",
              name: "求是用户",
              email: "user@zju.edu.cn",
              role: "user",
            },
          });
        }
        return makeJsonResponse({});
      }),
    );

    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText("浙大邮箱"), { target: { value: "user@zju.edu.cn" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /登录/ })[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

function makeJsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
