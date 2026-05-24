import { Instagram } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function InstagramComingSoon() {
  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Instagram</h1>
      <div className="card">
        <EmptyState
          icon={Instagram}
          title="Integração com Instagram Direct — em breve"
          description="Estamos trabalhando na integração com Instagram Messenger API. Em breve."
        />
      </div>
    </div>
  );
}
