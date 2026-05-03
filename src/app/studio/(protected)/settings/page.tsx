import { SettingsForm } from "@/components/studio/SettingsForm";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsForm initialSettings={getSettings()} />;
}
