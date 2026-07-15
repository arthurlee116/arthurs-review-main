import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleRenderer } from "@/components/ArticleRenderer";

describe("ArticleRenderer", () => {
  it("renders GFM with public reading wrappers and one page-level h1", () => {
    const markdown = [
      "# Markdown heading",
      "",
      "[Visible link](https://example.com)",
      "",
      "> Quoted argument",
      "",
      "- one",
      "- two",
      "",
      "`inline code`",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    const { container } = render(<ArticleRenderer markdown={markdown} />);

    expect(screen.getByRole("heading", { level: 2, name: "Markdown heading" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visible link" })).toHaveClass("prose-link");
    expect(screen.getByText("Quoted argument").closest("blockquote")).toBeInTheDocument();
    expect(screen.getByText("one").closest("ul")).toBeInTheDocument();
    expect(screen.getByText("inline code").closest("code")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).toHaveClass("prose-table-scroll");
    expect(container.querySelector(".prose")).toBeInTheDocument();
  });

  it("removes unsafe raw HTML", () => {
    const { container } = render(<ArticleRenderer markdown={'<script>alert("x")</script>\n\nSafe'} />);

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText("Safe")).toBeInTheDocument();
  });
});
