import { StudioNav } from "@/components/studio/StudioNav";
import { requireAdmin } from "@/lib/auth/session";

export default async function StudioProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="studio-shell">
      <StudioNav />
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
