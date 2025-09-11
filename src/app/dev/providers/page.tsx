import { detectProviders, formatProviderSummary } from "@/lib/providers";

export const metadata = { title: "Provider Health" };

export default function ProvidersHealthPage() {
  const info = detectProviders();
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Provider Health</h1>
        <p className="text-sm text-gray-500">Quick snapshot of configured LLM/Image providers and flags.</p>
      </header>

      <section>
        <h2 className="font-medium mb-2">Summary</h2>
        <pre className="bg-gray-100 rounded p-3 overflow-x-auto text-sm">
{formatProviderSummary(info)}
        </pre>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <h3 className="font-medium mb-2">Detected</h3>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>llm: <code>{info.llm ?? "none"}</code></li>
            <li>vision: <code>{info.vision ?? "none"}</code></li>
            <li>image: <code>{info.image ?? "none"}</code></li>
          </ul>
        </div>
        <div className="border rounded p-3">
          <h3 className="font-medium mb-2">Enabled</h3>
          {info.enabled.length ? (
            <ul className="list-disc list-inside text-sm space-y-1">
              {info.enabled.map((k) => (
                <li key={k}><code>{k}</code></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">None</p>
          )}
        </div>
        <div className="border rounded p-3">
          <h3 className="font-medium mb-2">Warnings</h3>
          {info.warnings.length ? (
            <ul className="list-disc list-inside text-sm space-y-1 text-amber-700">
              {info.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">None</p>
          )}
        </div>
      </section>

      <section className="border rounded p-3">
        <h3 className="font-medium mb-2">Flags</h3>
        <ul className="list-disc list-inside text-sm space-y-1">
          {Object.entries(info.flags).map(([k, v]) => (
            <li key={k}>
              <code>{k}</code>: <code>{String(v)}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

