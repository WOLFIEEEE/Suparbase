import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded border bg-bg-sunken px-3 py-2 text-sm text-fg placeholder:text-fg-faint",
          "hairline transition-colors",
          "focus:border-line-strong focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "font-mono",
          className,
        )}
        {...props}
      />
    );
  },
);
