import { getAgents, getAuditEvents, getKnowledgeSources } from '../lib/api';

export default async function DashboardPage() {
  const [agents, sources, audits] = await Promise.all([getAgents(), getKnowledgeSources(), getAuditEvents()]);
  return (
    <div className="stack">
      <section>
        <h1>Dashboard</h1>
        <p>展示当前 MVP 平台的 Agent、知识源和审计事件概况。</p>
      </section>
      <section className="card-grid">
        <div className="card"><h3>Agents</h3><p>{agents.length}</p></div>
        <div className="card"><h3>Knowledge Sources</h3><p>{sources.length}</p></div>
        <div className="card"><h3>Audit Events</h3><p>{audits.length}</p></div>
      </section>
      <section className="card">
        <h3>平台能力</h3>
        <ul>
          <li>配置驱动 Agent 模板</li>
          <li>文档知识库 + 工具双轨能力</li>
          <li>短期/长期记忆与审计日志</li>
          <li>Mock IM adapter 与 artifact 任务接口</li>
        </ul>
      </section>
    </div>
  );
}
