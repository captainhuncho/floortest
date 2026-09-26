import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
      <Logo className="mb-10" />
      <h1 className="text-3xl font-bold tracking-tight">Nothing on this link</h1>
      <p className="mt-3 text-mute">The page may have moved, or the link name was changed. Check the address and try again.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn-lime">
          Go to FloorTest
        </Link>
        <Link href="/dashboard/floor" className="btn-ghost">
          Your desk
        </Link>
      </div>
    </main>
  );
}
