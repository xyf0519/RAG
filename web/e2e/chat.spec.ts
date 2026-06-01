import { expect, test } from "@playwright/test";

test("chat workspace can stream a mocked answer", async ({ page, isMobile }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, backend: { ok: true, app: "Maverella" } }),
    });
  });
  await page.route("**/api/knowledge-bases", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
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
      ]),
    });
  });
  await page.route("**/api/chat", async (route) => {
    const events = [
      { type: "status", payload: { stage: "boundary", message: "正在判断问题范围" } },
      { type: "status", payload: { stage: "retrieve", message: "正在检索知识库" } },
      { type: "delta", payload: { text: "请在开学前两周" } },
      { type: "delta", payload: { text: "提交补考申请。[1]" } },
      {
        type: "final",
        payload: {
          answer: "请在开学前两周提交补考申请。[1]",
          session_id: "demo",
          knowledge_base_id: "kb-default",
          rewritten_query: "补考申请时间",
          boundary: { is_in_scope: true, probability: 0.92, reason: "classified" },
          sources: [
            {
              index: 1,
              doc_id: "exam",
              chunk_id: "exam-0001",
              title: "补考",
              score: 0.9,
              text: "补考申请应在开学前两周提交。",
              knowledge_base_id: "kb-default",
            },
          ],
          used_llm: false,
          timings: { llm_elapsed_seconds: 0, total_elapsed_seconds: 0.12 },
          error_code: null,
          error: null,
        },
      },
    ];
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "xyfrag.auth.v1",
      JSON.stringify({
        user: {
          id: "admin",
          name: "知识库管理员",
          email: "admin@xyfrag.cn",
          role: "admin",
        },
        issuedAt: Date.now(),
      }),
    );
  });

  await page.goto("/");
  await page.getByPlaceholder("输入校园资料库相关问题...").fill("挂科后什么时候申请补考？");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("请在开学前两周提交补考申请。[1]")).toBeVisible();
  if (!isMobile) {
    await page.getByRole("button", { name: "回答有帮助" }).click();
    await expect(page.getByText("反馈已记录")).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /挂科后什么时候申请补考/ })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "引用", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "补考" })).toBeVisible();
});
