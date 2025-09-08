import PlatePreview from '@/components/PlatePreview';

export default function PlatesDemoPage() {
  const rabbetSpec = {
    units: 'mm',
    host: { name: 'Side Panel', thickness: 18 },
    insert: { name: 'Back Panel', thickness: 6 },
    rabbet: { width: 12, depth: 6 },
  };

  const dadoSpec = {
    units: 'mm',
    host: { name: 'Side', thickness: 18, length: 1829, width: 305 },
    insert: { name: 'Shelf', thickness: 18 },
    dado: { axis: 'X', width: 18, depth: 6, offset: 500 },
  };

  const grooveSpec = {
    units: 'mm',
    host: { name: 'Side', thickness: 18, length: 1829, width: 305 },
    groove: { axis: 'X', width: 6.35, depth: 4, offset: 200 },
  };

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Joinery Plate Previews</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Renders rabbet/dado/groove plates via API routes using a plain &lt;img&gt; and correctly-encoded
        <code> ?spec=</code>.
      </p>

      <h2 style={{ fontSize: 18, margin: '24px 0 8px' }}>Rabbet</h2>
      <PlatePreview kind="rabbet" spec={rabbetSpec} />

      <h2 style={{ fontSize: 18, margin: '24px 0 8px' }}>Dado</h2>
      <PlatePreview kind="dado" spec={dadoSpec} />

      <h2 style={{ fontSize: 18, margin: '24px 0 8px' }}>Groove</h2>
      <PlatePreview kind="groove" spec={grooveSpec} />

      <p style={{ marginTop: 24, color: '#777' }}>
        If your mortise route expects canonical names, pass them:
      </p>
      <pre style={{ background: '#f7f7f7', padding: 12, borderRadius: 8 }}>
{`<PlatePreview
  kind="mortise"
  spec={someMortiseSpecJson}
  host="Front Left Post"
  insert="Upper Front Rail"
/>`}
      </pre>
    </div>
  );
}
