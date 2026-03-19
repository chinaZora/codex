from agent_runtime.runtime import AgentRuntime
from agent_runtime.templates import build_default_templates
from audit_service.store import InMemoryAuditStore
from knowledge_service.demo import load_demo_sources
from knowledge_service.service import KnowledgeService
from memory_service.service import MemoryService
from model_gateway.providers import MockChatProvider
from tool_hub.executor import ToolExecutor
from tool_hub.registry import build_default_registry
from shared_schema.models import SessionDebugRequest


def build_runtime() -> AgentRuntime:
    audit_store = InMemoryAuditStore()
    return AgentRuntime(
        agents=build_default_templates(),
        knowledge_service=KnowledgeService(load_demo_sources()),
        memory_service=MemoryService(),
        tool_executor=ToolExecutor(build_default_registry(), audit_store),
        chat_provider=MockChatProvider(),
        audit_store=audit_store,
    )


def test_policy_agent_returns_citations():
    runtime = build_runtime()
    response = runtime.handle_message(SessionDebugRequest(
        session_id='s1', agent_id='policy-knowledge', user_id='u1', message='员工转正申请要提前多久发起？'
    ))
    assert response.citations
    assert '引用依据' in response.answer


def test_report_agent_calls_tools():
    runtime = build_runtime()
    response = runtime.handle_message(SessionDebugRequest(
        session_id='s2', agent_id='report-summarizer', user_id='u1', message='请总结本周招聘报表并生成PPT大纲'
    ))
    tool_ids = [call.tool_id for call in response.tool_calls]
    assert 'report_summary' in tool_ids
    assert 'artifact_outline_generator' in tool_ids
