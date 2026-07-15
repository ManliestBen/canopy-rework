export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <h1 className="page-title">{title}</h1>
      <div className="placeholder-page panel">
        <div>
          <p style={{ fontSize: '2.5rem', margin: 0 }}>🌱</p>
          <p style={{ fontWeight: 800 }}>{title} is growing.</p>
          <p className="muted">Arriving in {phase}.</p>
        </div>
      </div>
    </div>
  );
}
