"use client";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/brand/fiddo-logo.svg" alt="Fiddo" width={36} height={36} priority />
          <span className="text-xl font-semibold tracking-tight" style={{color:"var(--fiddo-blue)"}}>
            Fiddo
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-neutral-700 hover:text-[color:var(--fiddo-teal)]">Dashboard</Link>
          <Link href="/orders" className="text-sm text-neutral-700 hover:text-[color:var(--fiddo-teal)]">Órdenes</Link>
          <Link href="/settings" className="text-sm text-neutral-700 hover:text-[color:var(--fiddo-teal)]">Ajustes</Link>
        </nav>
      </div>
    </header>
  );
}
