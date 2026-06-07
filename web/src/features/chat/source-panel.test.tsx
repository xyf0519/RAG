import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";

import { ChatWorkspace } from "./chat-workspace";

describe("ChatWorkspace", () => {
  let currentRole: "admin" | "user" = "admin";

  beforeEach(() => {
    currentRole = "admin";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/session")) {
          return jsonResponse({
            ok: true,
            user: {
              id: currentRole,
              name: currentRole === "admin" ? "知识库管理员" : "知识库用户",
              email: currentRole === "admin" ? "admin@zju.edu.cn" : "user@zju.edu.cn",
              role: currentRole,
            },
          });
        }
        if (url.includes("/api/health")) {
          return jsonResponse({ ok: true, backend: { ok: true, app: "Maverella" } });
        }
        if (url.endsWith("/api/admin/users")) {
          return jsonResponse({
            ok: true,
            users: [
              {
                id: "admin",
                name: "知识库管理员",
                email: "admin@zju.edu.cn",
                role: "admin",
                emailVerifiedAt: Date.now() / 1000,
                createdAt: Date.now() / 1000,
                lastLoginAt: Date.now() / 1000,
                coreAdmin: true,
              },
              {
                id: "student",
                name: "求是用户",
                email: "user@zju.edu.cn",
                role: "user",
                emailVerifiedAt: Date.now() / 1000,
                createdAt: Date.now() / 1000,
                lastLoginAt: null,
                coreAdmin: false,
              },
            ],
          });
        }
        if (url.includes("/api/admin/users/student/role")) {
          return jsonResponse({
            ok: true,
            user: {
              id: "student",
              name: "求是用户",
              email: "user@zju.edu.cn",
              role: "admin",
              emailVerifiedAt: Date.now() / 1000,
              createdAt: Date.now() / 1000,
              lastLoginAt: null,
              coreAdmin: false,
            },
          });
        }
        if (url.endsWith("/api/knowledge-bases")) {
          return jsonResponse([
            {
              id: "kb-default",
              name: "默认校园资料库",
              description: "默认知识库",
              status: "active",
              boundary_classifier_enabled: true,
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
        if (url.includes("/classifier-models")) {
          return jsonResponse([
            {
              id: "model-1",
              knowledge_base_id: "kb-default",
              name: "边界范围模型",
              scope: "knowledge_base",
              alias: "应用版",
              version: 1,
              status: "ready",
              artifact_path: "models/kb-default/boundary_classifier/classifier.joblib",
              metrics_json: "{\"accuracy\":1,\"sample_count\":4}",
              job_id: "classifier-1",
              created_at: Date.now() / 1000,
              activated_at: Date.now() / 1000,
            },
          ]);
        }
        if (url.includes("/boundary-items")) {
          return jsonResponse([
            {
              id: "sample-1",
              knowledge_base_id: "kb-default",
              text: "校园卡丢了怎么办？",
              label: 1,
              source: "manual",
              status: "approved",
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
    currentRole = role;
    window.localStorage.clear();
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

  it("renders the usable first screen", async () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    expect((await screen.findAllByRole("heading", { name: "Maverella" })).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("输入校园资料库相关问题...")).toBeInTheDocument();
    expect(screen.getByText("有什么需要查询？")).toBeInTheDocument();
    expect(screen.queryByText("挂科后什么时候申请补考？")).not.toBeInTheDocument();
  });

  it("opens the admin knowledge add workspace", async () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /添加知识库/ }));

    expect(screen.getByRole("heading", { name: "添加知识库" })).toBeInTheDocument();
    expect(screen.getByText("拖拽或点击上传")).toBeInTheDocument();
    expect(screen.getAllByText("默认校园资料库").length).toBeGreaterThan(0);
  });

  it("opens the boundary training workspace", async () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /边界训练/ }));

    expect(await screen.findByRole("heading", { name: "边界训练" })).toBeInTheDocument();
    expect(screen.getByText("手动添加")).toBeInTheDocument();
    expect(screen.getByText("智能扩充")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /训练并应用/ })).toBeInTheDocument();
    expect(screen.getByLabelText("模型名称")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("button", { name: /校园卡丢了怎么办/ }));

    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除样本" })).toBeInTheDocument();
  });

  it("opens the admin user operations workspace and updates roles", async () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /用户运维/ }));

    expect(await screen.findByRole("heading", { name: "用户运维" })).toBeInTheDocument();
    expect(screen.getByText("user@zju.edu.cn")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "管理员" }).find((button) => !button.hasAttribute("disabled"))!);

    expect(await screen.findByText("user@zju.edu.cn 已更新为管理员。")).toBeInTheDocument();
  });

  it("collapses the desktop sidebar into icon actions", async () => {
    seedSession("admin");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "收起侧栏" }));

    expect(screen.getAllByRole("button", { name: "展开侧栏" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "新建问答" })).toBeInTheDocument();
  });

  it("keeps knowledge governance hidden from regular users", async () => {
    seedSession("user");

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    await screen.findByPlaceholderText("输入校园资料库相关问题...");
    expect(screen.queryByRole("button", { name: /添加知识库/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /边界训练/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /用户运维/ })).not.toBeInTheDocument();
  });

  it("restores saved sessions from the history list", async () => {
    seedSession("admin");
    seedChatHistory();

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /校园卡挂失流程/ }));

    expect(screen.getByText("校园卡遗失后应及时挂失。")).toBeInTheDocument();
  });

  it("records answer feedback in the conversation", async () => {
    seedSession("admin");
    seedChatHistory();

    render(
      <AuthProvider>
        <ChatWorkspace />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "回答有帮助" }));

    expect(screen.getByText("反馈已记录")).toBeInTheDocument();
  });
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
