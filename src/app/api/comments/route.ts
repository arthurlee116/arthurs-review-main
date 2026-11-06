import { z } from "zod";
import { checkCommentRateLimit, looksLikeBot, verifyTurnstile } from "@/lib/comments/anti-spam";
import { NotFoundError } from "@/lib/errors";
import { createComment } from "@/lib/services/comments";

const SubmissionSchema = z.object({
  articleId: z.number().int().positive(),
  authorName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  body: z.string(),
  locale: z.enum(["zh", "en"]),
  // Anti-spam fields; never stored.
  website: z.unknown().optional(),
  startedAt: z.unknown().optional(),
  turnstileToken: z.unknown().optional(),
});

// Caddy overwrites X-Real-IP with the PROXY-protocol peer on every request, so it is
// the only address header a client cannot forge. Never read CF-Connecting-IP or the
// first X-Forwarded-For hop: nothing upstream sets or strips them.
function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export async function POST(request: Request) {
  let submission: z.infer<typeof SubmissionSchema>;
  try {
    submission = SubmissionSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  // Pretend success to bots so they get no signal to adapt to.
  if (looksLikeBot({ honeypot: submission.website, startedAt: submission.startedAt })) {
    return Response.json({ status: "pending" }, { status: 202 });
  }
  if (!checkCommentRateLimit(clientIp(request))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await verifyTurnstile(submission.turnstileToken))) {
    return Response.json({ error: "captcha" }, { status: 403 });
  }

  try {
    createComment({
      articleId: submission.articleId,
      authorName: submission.authorName,
      email: submission.email,
      body: submission.body,
      locale: submission.locale,
    });
    return Response.json({ status: "pending" }, { status: 202 });
  } catch (error) {
    if (error instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    if (error instanceof z.ZodError) {
      const field = String(error.issues[0]?.path[0] ?? "");
      return Response.json({ error: field === "email" ? "invalid_email" : "invalid" }, { status: 400 });
    }
    throw error;
  }
}
