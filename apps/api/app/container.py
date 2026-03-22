from agent_runtime.runtime import AgentRuntime
from agent_runtime.templates import build_default_templates
from audit_service.store import InMemoryAuditStore
from knowledge_service.demo import load_demo_sources
from knowledge_service.service import KnowledgeService
from memory_service.service import MemoryService
from model_gateway.providers import MockChatProvider, OpenAICompatibleProvider
from tool_hub.registry import build_default_registry
from tool_hub.executor import ToolExecutor
from app.config import settings


audit_store = InMemoryAuditStore()
memory_service = MemoryService()
knowledge_service = KnowledgeService(load_demo_sources())
tool_registry = build_default_registry()
tool_executor = ToolExecutor(registry=tool_registry, audit_store=audit_store)
chat_provider = (
    MockChatProvider()
    if settings.default_chat_provider == 'mock'
    else OpenAICompatibleProvider(
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        model=settings.openai_model,
    )
)
agent_runtime = AgentRuntime(
    agents=build_default_templates(),
    knowledge_service=knowledge_service,
    memory_service=memory_service,
    tool_executor=tool_executor,
    chat_provider=chat_provider,
    audit_store=audit_store,
)
