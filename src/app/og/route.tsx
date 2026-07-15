import { ImageResponse } from "next/og";
import { splitOgTitle } from "@/lib/og-title";

const size = { width: 1200, height: 630 };

function copy(request: Request) {
  const url = new URL(request.url);
  const title = (url.searchParams.get("title")?.trim() || "Arthur's Review").slice(0, 90);
  const kicker = (url.searchParams.get("kicker")?.trim() || "Independent publication").slice(0, 48);
  return { title, kicker };
}

export function GET(request: Request) {
  const { title, kicker } = copy(request);
  const fontSize = title.length > 56 ? 62 : title.length > 32 ? 74 : 88;
  const titleLines = splitOgTitle(title);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          background: "#f7f1e6",
          color: "#111111",
          padding: "58px 70px 54px",
          fontFamily: "serif",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, width: 22, height: "100%", background: "#c81524" }} />
        <div style={{ position: "absolute", top: 48, right: 70, width: 176, height: 10, background: "#c81524" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Arial", fontSize: 24, fontWeight: 700 }}>
          <span>{kicker}</span>
          <span>ARTHUR&apos;S REVIEW</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1040, fontSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.035em" }}>
          {titleLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "3px solid #111111", paddingTop: 24, fontFamily: "Arial", fontSize: 22 }}>
          <span>blog.leesaitool.com</span>
          <span>Articles, commentary, and things worth keeping.</span>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
