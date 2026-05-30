import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";

import { ChatWorkspace } from "./chat-workspace";

describe("ChatWorkspace", () => {
  function seedSession(role: "admin" | "user") {
    window.localStorage.setItem(
      "xyfrag.auth.v1",
      JSON.stringify({
        user: {
          id: role,
          name: role === "admin" ? "知识库管理员" : "知识库用户",
          email: role === "admin" ? "admin@xyfrag.cn" : "user@xyfrag.cn",
          role,
        },
        issuedAt: Date.now(),
      }),
    );
  }

  it("renders the usable first screen", () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    expect(screen.getByRole("heading", { name: "xyfRAG" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入校园资料库相关问题...")).toBeInTheDocument();
    expect(screen.getByText("可信问答工作台")).toBeInTheDocument();
    expect(screen.getByText("挂科后什么时候申请补考？")).toBeInTheDocument();
  });

  it("opens the admin knowledge governance workspace", () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /知识库治理/ }));

    expect(screen.getByRole("heading", { name: "知识库治理中心" })).toBeInTheDocument();
    expect(screen.getByText("知识源管理")).toBeInTheDocument();
    expect(screen.getByText("入库队列")).toBeInTheDocument();
  });

  it("opens the admin quality analytics workspace", () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /质量分析/ }));

    expect(screen.getByRole("heading", { name: "质量分析中心" })).toBeInTheDocument();
    expect(screen.getByText("可信回答趋势")).toBeInTheDocument();
    expect(screen.getByText("待复核回答")).toBeInTheDocument();
  });

  it("collapses the desktop sidebar into icon actions", () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));

    expect(screen.getAllByRole("button", { name: "展开侧栏" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "新建问答" })).toBeInTheDocument();
  });

  it("keeps knowledge governance hidden from regular users", () => {
    seedSession("user");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    expect(screen.queryByRole("button", { name: /知识库治理/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /质量分析/ })).not.toBeInTheDocument();
  });
});
