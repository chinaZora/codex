import { getKnowledgeSources } from '../../lib/api';

export default async function KnowledgePage() {
  const sources = await getKnowledgeSources();
  return (
    <div className="stack">
      <h1>Knowledge Sources</h1>
      <div className="card-grid">
        {sources.map((source: any) => (
          <div key={source.id} className="card">
            <h3>{source.name}</h3>
            <p>{source.description}</p>
            <span className="badge">{source.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
