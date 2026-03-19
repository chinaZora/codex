from shared_schema.models import AgentDefinition, AgentUpdateRequest
from app.container import agent_runtime
from app.exceptions import NotFoundError


class AgentService:
    def list_agents(self) -> list[AgentDefinition]:
        return agent_runtime.list_agents()

    def get_agent(self, agent_id: str) -> AgentDefinition:
        agent = agent_runtime.get_agent(agent_id)
        if not agent:
            raise NotFoundError(f'Agent {agent_id} not found')
        return agent

    def update_agent(self, agent_id: str, payload: AgentUpdateRequest) -> AgentDefinition:
        return agent_runtime.update_agent(agent_id, payload)
