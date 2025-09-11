import Link from "next/link";

export const metadata = { title: "Dev Index" };

const links = [
  { href: "/dev/providers", label: "Provider Health" },
  { href: "/dev/oneclick", label: "One-Click" },
  { href: "/dev/plates", label: "Plates" },
  { href: "/dev/photo3d", label: "Photo 3D" },
  { href: "/dev/photo3d-csg", label: "Photo 3D (CSG)" },
  { href: "/dev/spec-to-pic", label: "Spec → Picture" },
  { href: "/dev/three-preview", label: "Three.js Preview" },
];

export default function DevIndexPage() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dev Index</h1>
        <p className="text-sm text-gray-500">Quick links to development and diagnostic pages.</p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map((l) => (
          <li key={l.href} className="border rounded hover:border-black transition-colors">
            <Link href={l.href} className="block p-3">
              <span className="font-medium">{l.label}</span>
              <span className="block text-xs text-gray-500">{l.href}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

