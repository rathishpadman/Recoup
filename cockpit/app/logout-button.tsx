"use client";

import type * as React from "react";

type LogoutButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick" | "type"> & {
  children?: React.ReactNode;
  size?: "default" | "sm";
  variant?: "default" | "outline";
};

export function LogoutButton({
  children = "Sign out",
  className,
  size = "default",
  variant = "default",
  ...props
}: LogoutButtonProps) {
  async function signOut(): Promise<void> {
    await fetch("/api/demo-logout", { method: "POST" });
    window.location.assign("/login");
  }

  const classes = [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-8 px-3" : "h-9 px-4 py-2",
    variant === "outline"
      ? "border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
      : "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-label="Sign out"
      className={classes}
      onClick={() => {
        void signOut();
      }}
      title="Sign out"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
