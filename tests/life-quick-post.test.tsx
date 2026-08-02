import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeQuickPost } from "@/components/studio/LifeQuickPost";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/studio/precompress", () => ({
  precompressImage: vi.fn(async (file: File) => file),
}));

function imageUpload(name: string) {
  return {
    ok: true,
    json: async () => ({
      kind: "image",
      publicPath: `/media/2026/07/${name}.webp`,
      relativePath: `uploads/2026/07/${name}.webp`,
    }),
  };
}

function articleResponse(id: number) {
  return { ok: true, json: async () => ({ article: { id } }) };
}

function publishResponse() {
  return { ok: true, json: async () => ({ article: {} }) };
}

function imageFile(name = "a.jpg") {
  return new File(["bytes"], name, { type: "image/jpeg" });
}

beforeEach(() => {
  router.push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LifeQuickPost", () => {
  it("rejects files beyond the 10-item limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageUpload("x")));
    const user = userEvent.setup();
    render(<LifeQuickPost />);
    const input = screen.getByLabelText(/choose photos or videos/i);
    const files = Array.from({ length: 11 }, (_, index) => imageFile(`${index}.jpg`));
    await user.upload(input, files);
    expect(await screen.findByText(/最多 10 个文件/)).toBeInTheDocument();
  });

  it("uploads a selected image and enables publish when done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageUpload("a")));
    const user = userEvent.setup();
    render(<LifeQuickPost />);
    const publish = screen.getByRole("button", { name: /发布/ });
    expect(publish).toBeDisabled();
    await user.upload(screen.getByLabelText(/choose photos or videos/i), imageFile());
    await waitFor(() => expect(publish).toBeEnabled());
  });

  it("publishes with generated fields and navigates to /life", async () => {
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/studio/api/media") return imageUpload("a");
        if (url === "/studio/api/articles") {
          calls.push({ url, body: JSON.parse(String(init?.body)) });
          return articleResponse(42);
        }
        calls.push({ url });
        return publishResponse();
      }),
    );
    const user = userEvent.setup();
    render(<LifeQuickPost />);
    await user.upload(screen.getByLabelText(/choose photos or videos/i), imageFile());
    await user.type(screen.getByLabelText(/caption/i), "今天吃了海鲜饭");
    const publish = screen.getByRole("button", { name: /发布/ });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/life"));
    const create = calls.find((call) => call.url === "/studio/api/articles");
    expect(create?.body).toMatchObject({
      category: "life",
      titleZh: expect.any(String),
      slug: expect.stringMatching(/^life-\d{4}-\d{2}-\d{2}-[a-z0-9]{4}$/),
      bodyZh: "![](/media/2026/07/a.webp)\n\n今天吃了海鲜饭",
      coverImagePath: "uploads/2026/07/a.webp",
      titleEn: null,
      excerptEn: null,
      bodyEn: null,
      tagIds: [],
    });
    expect(calls.map((call) => call.url)).toContain("/studio/api/articles/42/publish");
  });

  it("shows the server error when article creation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/studio/api/media") return imageUpload("a");
        return { ok: false, json: async () => ({ error: "Slug already exists" }) };
      }),
    );
    const user = userEvent.setup();
    render(<LifeQuickPost />);
    await user.upload(screen.getByLabelText(/choose photos or videos/i), imageFile());
    const publish = screen.getByRole("button", { name: /发布/ });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);
    expect(await screen.findByText(/Slug already exists/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("publishes with the selected cover first in the body and as the cover image", async () => {
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/studio/api/media") {
          const file = (init?.body as FormData).get("file") as File;
          return imageUpload(file.name.replace(/\.jpg$/, ""));
        }
        if (url === "/studio/api/articles") {
          calls.push({ url, body: JSON.parse(String(init?.body)) });
          return articleResponse(42);
        }
        calls.push({ url });
        return publishResponse();
      }),
    );
    const user = userEvent.setup();
    render(<LifeQuickPost />);
    await user.upload(screen.getByLabelText(/choose photos or videos/i), [imageFile("a.jpg"), imageFile("b.jpg")]);
    const publish = screen.getByRole("button", { name: /发布/ });
    await waitFor(() => expect(publish).toBeEnabled());

    const row = screen.getByText("b.jpg").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /设为封面/ }));
    expect(within(row).getByText("封面")).toBeInTheDocument();

    await user.click(publish);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/life"));
    const create = calls.find((call) => call.url === "/studio/api/articles");
    expect(create?.body).toMatchObject({
      bodyZh: "![](/media/2026/07/b.webp)\n![](/media/2026/07/a.webp)",
      coverImagePath: "uploads/2026/07/b.webp",
    });
  });

  it("keeps publish disabled when an upload failed and enables it after removing the failed file", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempt += 1;
        return attempt === 1
          ? { ok: false, json: async () => ({ error: "Only images and videos are allowed." }) }
          : imageUpload("a");
      }),
    );
    const user = userEvent.setup();
    render(<LifeQuickPost />);
    await user.upload(screen.getByLabelText(/choose photos or videos/i), imageFile());
    expect(await screen.findByText(/allowed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /发布/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /移除/ }));
    await user.upload(screen.getByLabelText(/choose photos or videos/i), imageFile());
    await waitFor(() => expect(screen.getByRole("button", { name: /发布/ })).toBeEnabled());
  });
});
