import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function WhatsappComingSoon() {
  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">WhatsApp</h1>
      <div className="card">
        <EmptyState
          icon={MessageSquare}
          title="Integração com WhatsApp — em breve"
          description="Estamos trabalhando na integração oficial com a WhatsApp Business API. Vamos avisar assim que ficar pronta."
        />
      </div>
    </div>
  );
}
