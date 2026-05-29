import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatWorkspace } from "./chat-workspace";

describe("ChatWorkspace", () => {
  it("renders the usable first screen", () => {
    render(<ChatWorkspace />);

    expect(screen.getByRole("heading", { name: "xyfRAG" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入校园资料库相关问题...")).toBeInTheDocument();
    expect(screen.getByText("挂科后什么时候申请补考？")).toBeInTheDocument();
  });
});
