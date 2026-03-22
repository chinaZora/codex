import { getAuditEvents } from '../../lib/api';

export default async function AuditPage() {
  const events = await getAuditEvents();
  return (
    <div className="stack">
      <h1>Audit 日志</h1>
      <table className="table">
        <thead><tr><th>Type</th><th>Agent</th><th>Session</th><th>User</th><th>Details</th></tr></thead>
        <tbody>
          {events.map((event: any) => (
            <tr key={event.id}>
              <td>{event.event_type}</td>
              <td>{event.agent_id}</td>
              <td>{event.session_id}</td>
              <td>{event.user_id}</td>
              <td><pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(event.details, null, 2)}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
