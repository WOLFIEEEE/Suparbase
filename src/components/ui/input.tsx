import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded border bg-bg-sunken px-3 py-2 text-sm text-fg placeholder:text-fg-faint",
        "hairline transition-colors",
        "focus:border-line-strong focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "font-mono",
        className,
      )}
      {...props}
    />
  );
});
