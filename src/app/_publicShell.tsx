import { Masthead } from "@/components/Masthead";
import { ContactNotice } from "@/components/ContactNotice";
import { ContactPromptModal } from "@/components/ContactPromptModal";
import { PublicNav } from "@/components/PublicNav";

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
    <div>
      <ContactPromptModal />
      <Masthead headingLevel={mastheadHeadingLevel} />
      {noticePlacement === "beforeNav" ? <ContactNotice className="container mt-7" /> : null}
      <PublicNav />
      {children}
    </div>
  );
}
