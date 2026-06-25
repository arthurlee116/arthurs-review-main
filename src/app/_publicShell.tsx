import { Masthead } from "@/components/Masthead";
import { PublicNav } from "@/components/PublicNav";

export function PublicShell({ children, mastheadHeadingLevel = 1 }: { children: React.ReactNode; mastheadHeadingLevel?: 1 | 2 }) {
  return (
    <div>
      <Masthead headingLevel={mastheadHeadingLevel} />
      <PublicNav />
      {children}
    </div>
  );
}
