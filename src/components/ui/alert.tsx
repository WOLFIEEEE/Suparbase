import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui/cn";

const alertVariants = cva(
  "relative w-full rounded border p-4 text-sm",
  {
    variants: {
      tone: {
        info: "border-line bg-bg-raised text-fg",
        danger: "border-danger/40 bg-danger/10 text-danger",
        warn: "border-warn/40 bg-warn/10 text-warn",
        accent: "border-accent/40 bg-accent/10 text-accent",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, tone, role = "alert", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={role}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  );
});

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)} {...props} />;
}
