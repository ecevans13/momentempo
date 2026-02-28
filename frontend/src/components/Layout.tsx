import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      {children}
    </main>
  );
}
