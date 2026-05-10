import { Masthead } from "@/components/Masthead";
import { PublicNav } from "@/components/PublicNav";
import { publicSerif } from "./fonts";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${publicSerif.variable} ${publicSerif.className}`}>
      <Masthead />
      <PublicNav />
      {children}
    </div>
  );
}
