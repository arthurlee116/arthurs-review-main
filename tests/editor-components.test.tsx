import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "@/components/studio/MarkdownEditor";

describe("MarkdownEditor", () => {
  it("shows a sanitized markdown preview beside the editor", () => {
    render(<MarkdownEditor label="Chinese body" value={"## 标题\n\n正文"} onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: "Chinese body" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "标题" })).toBeVisible();
    expect(screen.getByText("正文")).toBeVisible();
  });

  it("uploads an inline image and inserts the public markdown image link", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          publicPath: "/media/2026/05/inline.webp",
        }),
      ),
    );

    render(<MarkdownEditor label="Chinese body" value="正文" onChange={onChange} />);

    await user.upload(screen.getByLabelText("Insert inline image"), new File(["image"], "inline.png", { type: "image/png" }));

    expect(onChange).toHaveBeenCalledWith("正文\n\n![inline](/media/2026/05/inline.webp)");
    vi.unstubAllGlobals();
  });
});
