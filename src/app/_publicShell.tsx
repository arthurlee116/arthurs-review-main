import { Suspense } from "react";
import { Masthead } from "@/components/Masthead";
import { PublicNav, PublicNavStatic } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

export function PublicShell({
  children,
  mastheadHeadingLevel = 1,
}: {
  children: React.ReactNode;
  mastheadHeadingLevel?: 1 | 2;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Masthead headingLevel={mastheadHeadingLevel} />
      <Suspense fallback={<PublicNavStatic />}>
        <PublicNav />
      </Suspense>
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
