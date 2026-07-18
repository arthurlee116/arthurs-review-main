import { Masthead } from "@/components/Masthead";
import { ContactNotice } from "@/components/ContactNotice";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

export function PublicShell({
  children,
  mastheadHeadingLevel = 1,
  noticePlacement,
}: {
  children: React.ReactNode;
  mastheadHeadingLevel?: 1 | 2;
  noticePlacement?: "beforeNav";
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Masthead headingLevel={mastheadHeadingLevel} />
      {noticePlacement === "beforeNav" ? <ContactNotice className="container mt-7" /> : null}
      <PublicNav compactTop={noticePlacement === "beforeNav"} />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
