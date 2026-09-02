import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/ui/cn";

const buttonVariants = cva(
  // focus-visible:ring-* gives keyboard users a visible focus state.
  // The global :focus-visible outline in globals.css covers everything
  // else; for Button specifically we want a 2px accent ring inset from
  // the button edge so it reads well over both `bg-accent` (primary)
  // and `bg-bg` (ghost) surfaces.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80",
        secondary: "bg-bg-raised text-fg hairline border hover:border-line-strong hover:bg-bg-raised/80",
        ghost: "text-fg hover:bg-bg-raised",
        danger: "bg-danger text-danger-fg hover:bg-danger/90",
        link: "text-accent underline-offset-4 hover:underline",
        outline: "border hairline bg-transparent text-fg hover:border-line-strong",
      },
      size: {
        // Coarse/mobile layouts get a larger touch target; desktop retains
        // the compact density expected from an admin tool.
        sm: "h-10 px-3 text-xs sm:h-8",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
