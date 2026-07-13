import fs from "node:fs";

import { getPublicationProof, resolveProofPath } from "@/lib/services/publication-proofs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const proof = getPublicationProof(Number(id));

  if (!proof) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const source = fs.readFileSync(resolveProofPath(proof.documentPath));

    return new Response(new Uint8Array(source), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `attachment; filename="publication-proof-${proof.id}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
