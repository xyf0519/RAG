import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-[var(--accent)] bg-[linear-gradient(180deg,#08786e_0%,var(--accent-strong)_100%)] text-white hover:brightness-105",
        secondary: "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--panel-strong)]",
        ghost: "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--panel-strong)]",
        danger: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[#ffe3e0]",
      },
      size: {
        sm: "h-8 px-2 text-xs",
        md: "h-10 px-3 text-sm",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";
