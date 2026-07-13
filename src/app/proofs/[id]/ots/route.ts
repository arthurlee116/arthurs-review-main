import fs from "node:fs";
import { getPublicationProof, resolveProofPath } from "@/lib/services/publication-proofs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const proof = getPublicationProof(Number(id));
  if (!proof?.otsPath) return new Response("Not found", { status: 404 });
  const body = new Uint8Array(fs.readFileSync(resolveProofPath(proof.otsPath)));
  return new Response(body, {
    headers: {
      "content-type": "application/vnd.opentimestamps.ots",
      "content-disposition": `attachment; filename="publication-proof-${proof.id}.ots"`,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
