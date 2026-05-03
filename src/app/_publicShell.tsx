import { Masthead } from "@/components/Masthead";
import { PublicNav } from "@/components/PublicNav";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Masthead />
      <PublicNav />
      {children}
    </>
  );
}
