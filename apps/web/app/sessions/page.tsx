import { sendDebugMessage } from './actions';

export default function SessionsPage() {
  return (
    <div className="stack">
      <h1>Session 调试</h1>
      <form action={sendDebugMessage} className="card stack">
        <label>Session ID<input name="session_id" className="input" defaultValue="demo-session-001" /></label>
        <label>Agent ID<input name="agent_id" className="input" defaultValue="policy-knowledge" /></label>
        <label>User ID<input name="user_id" className="input" defaultValue="demo-user" /></label>
        <label>消息<textarea name="message" className="textarea" rows={4} defaultValue="请告诉我员工转正申请需要提前多久发起？" /></label>
        <button className="button" type="submit">发送调试消息</button>
      </form>
      <div className="card">
        <h3>建议测试输入</h3>
        <ul>
          <li>招聘群：帮我查一下候选人和后端岗位 JD</li>
          <li>制度助手：年假额度何时刷新？</li>
          <li>报表助手：请总结本周招聘报表并生成 PPT 大纲</li>
        </ul>
      </div>
      <div className="card">
        <p>提交后页面会跳转到原结果页 JSON。MVP 阶段优先保证完整 demo 链路与调试能力。</p>
      </div>
    </div>
  );
}
