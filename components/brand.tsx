import { getI18n } from "@/lib/i18n/server";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

export async function Brand({ dark = false }: { dark?: boolean }) {
  const { t } = await getI18n();

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-xl",
          dark ? "bg-white/10 text-emerald-200" : "bg-primary text-white",
        )}
      >
        <Sprout className="size-6" aria-hidden="true" />
      </span>
      <div>
        <span className="block text-xl font-bold tracking-tight">
          {t("SevaSathi")}
        </span>
      </div>
    </div>
  );
}
