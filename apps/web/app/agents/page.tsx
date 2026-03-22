import Link from 'next/link';
import { getAgents } from '../../lib/api';

export default async function AgentsPage() {
  const agents = await getAgents();
  return (
    <div className="stack">
      <h1>Agent 列表</h1>
      <table className="table">
        <thead><tr><th>ID</th><th>Name</th><th>Description</th><th>Tools</th><th></th></tr></thead>
        <tbody>
          {agents.map((agent: any) => (
            <tr key={agent.id}>
              <td>{agent.id}</td>
              <td>{agent.name}</td>
              <td>{agent.description}</td>
              <td>{agent.enabled_tools.join(', ')}</td>
              <td><Link href={`/agents/${agent.id}`}>查看配置</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
