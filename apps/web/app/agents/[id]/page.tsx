import { getAgents } from '../../../lib/api';

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const agents = await getAgents();
  const agent = agents.find((item: any) => item.id === params.id);
  if (!agent) return <div>Agent not found.</div>;
  return (
    <div className="stack">
      <h1>{agent.name}</h1>
      <div className="split">
        <div className="card">
          <h3>基础配置</h3>
          <p><strong>ID:</strong> {agent.id}</p>
          <p><strong>Description:</strong> {agent.description}</p>
          <p><strong>Output:</strong> {agent.output_style}</p>
          <p><strong>Knowledge:</strong> {agent.enabled_knowledge_sources.join(', ') || '无'}</p>
        </div>
        <div className="card">
          <h3>System Prompt</h3>
          <p>{agent.system_prompt}</p>
          <h4>Enabled Tools</h4>
          <ul>{agent.enabled_tools.map((tool: string) => <li key={tool}>{tool}</li>)}</ul>
        </div>
      </div>
      <div className="card">
        <h3>可编辑字段（MVP 展示）</h3>
        <input className="input" defaultValue={agent.description} readOnly />
        <textarea className="textarea" rows={6} defaultValue={agent.system_prompt} readOnly />
        <p>TODO: 下一阶段接入真实表单提交与版本管理。</p>
      </div>
    </div>
  );
}
