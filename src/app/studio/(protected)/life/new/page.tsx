import { connection } from "next/server";
import { LifeQuickPost } from "@/components/studio/LifeQuickPost";

export const instant = false;

export default async function NewLifePostPage() {
  await connection();
  return (
    <section>
      <h1 className="mb-6 text-4xl font-bold">发生活</h1>
      <LifeQuickPost />
    </section>
  );
}
