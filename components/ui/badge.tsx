import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs leading-7 font-medium ring-1 ring-inset [&>span]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}
