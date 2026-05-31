import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";

import { ChatWorkspace } from "./chat-workspace";

describe("ChatWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/health")) {
          return jsonResponse({ ok: true, backend: { ok: true, app: "xyfRAG" } });
        }
        if (url.endsWith("/api/knowledge-bases")) {
          return jsonResponse([
            {
              id: "kb-default",
              name: "默认校园资料库",
              description: "默认知识库",
              status: "active",
              document_count: 3,
              index_status: "ready",
              last_indexed_at: null,
              updated_at: Date.now() / 1000,
              created_at: Date.now() / 1000,
            },
          ]);
        }
        if (url.includes("/documents")) {
          return jsonResponse([
            {
              id: "doc-guide",
              knowledge_base_id: "kb-default",
              filename: "guide.md",
              title: "校园卡指南",
              size: 128,
              status: "indexed",
              created_at: Date.now() / 1000,
            },
          ]);
        }
        return jsonResponse({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function seedSession(role: "admin" | "user") {
    window.localStorage.clear();
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

  function seedChatHistory() {
    const sessionId = "session-history";
    window.localStorage.setItem("xyfrag.session.v1", sessionId);
    window.localStorage.setItem(
      `xyfrag.chat.v1.${sessionId}`,
      JSON.stringify([
        {
          id: "user-history",
          role: "user",
          content: "校园卡挂失流程",
          createdAt: Date.now() - 60_000,
          knowledgeBaseId: "kb-default",
          knowledgeBaseName: "默认校园资料库",
        },
        {
          id: "assistant-history",
          role: "assistant",
          content: "校园卡遗失后应及时挂失。",
          createdAt: Date.now() - 55_000,
          knowledgeBaseId: "kb-default",
          knowledgeBaseName: "默认校园资料库",
        },
      ]),
    );
    window.localStorage.setItem(
      "xyfrag.sessions.v1",
      JSON.stringify([
        {
          id: sessionId,
          title: "校园卡挂失流程",
          createdAt: Date.now() - 60_000,
          updatedAt: Date.now() - 55_000,
          knowledgeBaseId: "kb-default",
          knowledgeBaseName: "默认校园资料库",
          turnCount: 1,
          sourceCount: 0,
          hasFeedback: false,
        },
      ]),
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
    expect(screen.getByText("知识库列表")).toBeInTheDocument();
    expect(screen.getByText("拖拽文档到这里，或点击上传")).toBeInTheDocument();
    expect(screen.getByText("熔断器训练台")).toBeInTheDocument();
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

  it("restores saved sessions from the history list", () => {
    seedSession("admin");
    seedChatHistory();

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /校园卡挂失流程/ }));

    expect(screen.getByText("校园卡遗失后应及时挂失。")).toBeInTheDocument();
  });

  it("records answer feedback in the conversation", () => {
    seedSession("admin");
    seedChatHistory();

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "回答有帮助" }));

    expect(screen.getByText("反馈已记录")).toBeInTheDocument();
  });
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
