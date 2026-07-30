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

  it("renders an .mp4 image embed as a video with a poster", () => {
    const { container } = render(
      <ArticleRenderer markdown={"![clip](/media/2026/07/x.mp4?poster=/media/2026/07/y.webp)"} />,
    );

    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("src", "/media/2026/07/x.mp4");
    expect(video).toHaveAttribute("poster", "/media/2026/07/y.webp");
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders a normal image embed as an img", () => {
    const { container } = render(<ArticleRenderer markdown={"![alt text](/media/2026/07/photo.webp)"} />);

    const image = container.querySelector("img");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "/media/2026/07/photo.webp");
    expect(image).toHaveAttribute("alt", "alt text");
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });
});
