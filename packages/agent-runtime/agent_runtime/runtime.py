from __future__ import annotations

from datetime import datetime, timezone

from audit_service.store import InMemoryAuditStore
from knowledge_service.service import KnowledgeService
from memory_service.service import MemoryService
from model_gateway.providers import BaseChatProvider
from shared_schema.models import (
    AgentDefinition,
    AgentResponse,
    AgentUpdateRequest,
    AuditEvent,
    MemoryItem,
    SessionDebugRequest,
)
from tool_hub.executor import ToolContext, ToolExecutor


class AgentRuntime:
    def __init__(
        self,
        agents: dict[str, AgentDefinition],
        knowledge_service: KnowledgeService,
        memory_service: MemoryService,
        tool_executor: ToolExecutor,
        chat_provider: BaseChatProvider,
        audit_store: InMemoryAuditStore,
    ):
        self.agents = agents
        self.knowledge_service = knowledge_service
        self.memory_service = memory_service
        self.tool_executor = tool_executor
        self.chat_provider = chat_provider
        self.audit_store = audit_store

    def list_agents(self) -> list[AgentDefinition]:
        return list(self.agents.values())

    def get_agent(self, agent_id: str) -> AgentDefinition | None:
        return self.agents.get(agent_id)

    def update_agent(self, agent_id: str, payload: AgentUpdateRequest) -> AgentDefinition:
        agent = self.agents[agent_id]
        updated = agent.model_copy(update=payload.model_dump(exclude_none=True))
        self.agents[agent_id] = updated
        return updated

    def handle_message(self, request: SessionDebugRequest) -> AgentResponse:
        agent = self.agents[request.agent_id]
        short_memory = self.memory_service.read_short_term(request.session_id)
        knowledge_hits = []
        tool_calls = []
        lowered = request.message.lower()

        if agent.enabled_knowledge_sources and any(token in request.message for token in ['制度', '转正', '年假', 'offer']):
            knowledge_hits = self.knowledge_service.search(
                request.message,
                {'source_id': agent.enabled_knowledge_sources[0]},
            )
            self.audit_store.add(
                AuditEvent(
                    id=f"audit-knowledge-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                    event_type='knowledge_query',
                    agent_id=agent.id,
                    session_id=request.session_id,
                    user_id=request.user_id,
                    details={'query': request.message, 'hits': [item.id for item in knowledge_hits]},
                )
            )

        context = ToolContext(agent_id=agent.id, session_id=request.session_id, user_id=request.user_id)
        if '候选人' in request.message and 'candidate_lookup' in agent.enabled_tools:
            tool_calls.append(self.tool_executor.execute('candidate_lookup', {'query': request.message}, context))
        if ('jd' in lowered or '岗位' in request.message) and 'jd_lookup' in agent.enabled_tools:
            tool_calls.append(self.tool_executor.execute('jd_lookup', {'query': request.message}, context))
        if any(token in request.message for token in ['报表', '周报', '日报', '总结']) and 'report_summary' in agent.enabled_tools:
            tool_calls.append(self.tool_executor.execute('report_summary', {'query': request.message}, context))
        if any(token in lowered for token in ['ppt', '大纲']) and 'artifact_outline_generator' in agent.enabled_tools:
            tool_calls.append(self.tool_executor.execute('artifact_outline_generator', {'query': request.message}, context))

        prompt_parts = [
            f"Agent: {agent.name}",
            f"System Prompt: {agent.system_prompt}",
            f"User Message: {request.message}",
            f"Short Memory: {[item.content for item in short_memory]}",
            f"Knowledge Hits: {[item.content for item in knowledge_hits]}",
            f"Tool Results: {[call.result for call in tool_calls]}",
        ]
        model_result = self.chat_provider.chat(
            [
                {'role': 'system', 'content': agent.system_prompt},
                {'role': 'user', 'content': '\n'.join(prompt_parts)},
            ]
        )

        answer_lines = [model_result.content]
        if knowledge_hits:
            answer_lines.append('引用依据：')
            answer_lines.extend(f"- {hit.content}" for hit in knowledge_hits)
        if tool_calls:
            answer_lines.append('工具结果：')
            answer_lines.extend(
                f"- {call.tool_id}: {call.result['result']}" for call in tool_calls if call.result
            )

        memory_item = MemoryItem(
            id=f"mem-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            scope='session',
            type='message',
            content=request.message,
            session_id=request.session_id,
            user_id=request.user_id,
        )
        self.memory_service.append_short_term(request.session_id, memory_item)
        self.audit_store.add(
            AuditEvent(
                id=f"audit-memory-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                event_type='memory_write',
                agent_id=agent.id,
                session_id=request.session_id,
                user_id=request.user_id,
                details={'memory_item_id': memory_item.id},
            )
        )
        self.audit_store.add(
            AuditEvent(
                id=f"audit-agent-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                event_type='agent_run',
                agent_id=agent.id,
                session_id=request.session_id,
                user_id=request.user_id,
                details={'message': request.message},
            )
        )

        return AgentResponse(
            session_id=request.session_id,
            agent_id=agent.id,
            answer='\n'.join(answer_lines),
            citations=knowledge_hits,
            tool_calls=tool_calls,
            memory_snapshot=self.memory_service.read_short_term(request.session_id),
        )
