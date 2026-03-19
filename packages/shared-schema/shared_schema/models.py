from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, Field


class PlatformBaseModel(BaseModel):
    tenant_id: str = 'demo-tenant'
    department_id: str | None = None
    visibility_scope: Literal['tenant', 'department', 'private', 'public'] = 'tenant'


class User(PlatformBaseModel):
    id: str
    name: str
    role: str = 'hr'


class MemoryPolicy(BaseModel):
    enable_short_term: bool = True
    enable_long_term: bool = True
    session_window: int = 8


class Guardrails(BaseModel):
    allow_tool_calls: bool = True
    allow_external_reply: bool = True
    redact_pii: bool = True


class AgentDefinition(PlatformBaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    enabled_tools: list[str] = Field(default_factory=list)
    enabled_knowledge_sources: list[str] = Field(default_factory=list)
    memory_policy: MemoryPolicy = Field(default_factory=MemoryPolicy)
    output_style: str = 'concise'
    guardrails: Guardrails = Field(default_factory=Guardrails)
    status: str = 'active'


class AgentVersion(PlatformBaseModel):
    id: str
    agent_id: str
    version: str
    changelog: str


class Session(PlatformBaseModel):
    id: str
    agent_id: str
    user_id: str
    title: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Message(PlatformBaseModel):
    id: str
    session_id: str
    role: Literal['user', 'assistant', 'system']
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class KnowledgeSource(PlatformBaseModel):
    id: str
    name: str
    description: str
    kind: Literal['document', 'wiki', 'faq'] = 'document'
    status: str = 'ready'


class KnowledgeChunk(PlatformBaseModel):
    id: str
    source_id: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    score: float = 0.0


class MemoryItem(PlatformBaseModel):
    id: str
    scope: Literal['session', 'user', 'group', 'tenant']
    type: Literal['message', 'summary', 'preference', 'fact', 'experience']
    content: str
    confidence: float = 0.8
    ttl: int | None = None
    session_id: str | None = None
    user_id: str | None = None
    group_id: str | None = None


class ToolIO(BaseModel):
    type: str = 'object'
    properties: dict[str, Any] = Field(default_factory=dict)
    required: list[str] = Field(default_factory=list)


class ToolDefinition(PlatformBaseModel):
    id: str
    name: str
    description: str
    input_schema: ToolIO
    output_schema: ToolIO
    permissions: list[str] = Field(default_factory=list)


class ToolCall(BaseModel):
    tool_id: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None


class KnowledgeQuery(BaseModel):
    query: str
    source_ids: list[str] = Field(default_factory=list)
    top_k: int = 3


class AuditEvent(PlatformBaseModel):
    id: str
    event_type: Literal['agent_run', 'tool_call', 'knowledge_query', 'memory_write', 'artifact_task']
    agent_id: str | None = None
    session_id: str | None = None
    user_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ArtifactTask(PlatformBaseModel):
    id: str
    agent_id: str
    session_id: str
    artifact_type: str
    status: str
    prompt: str


class AgentResponse(BaseModel):
    session_id: str
    agent_id: str
    answer: str
    citations: list[KnowledgeChunk] = Field(default_factory=list)
    tool_calls: list[ToolCall] = Field(default_factory=list)
    memory_snapshot: list[MemoryItem] = Field(default_factory=list)


class SessionDebugRequest(BaseModel):
    session_id: str
    agent_id: str
    user_id: str
    message: str
    tenant_id: str = 'demo-tenant'


class KnowledgeSearchRequest(BaseModel):
    query: str
    filters: dict[str, Any] = Field(default_factory=dict)


class AgentUpdateRequest(BaseModel):
    description: str | None = None
    system_prompt: str | None = None
    enabled_tools: list[str] | None = None
    enabled_knowledge_sources: list[str] | None = None
    output_style: str | None = None


class ArtifactTaskRequest(BaseModel):
    tenant_id: str = 'demo-tenant'
    agent_id: str
    session_id: str
    artifact_type: str
    prompt: str


class NormalizedIMMessage(BaseModel):
    adapter: str
    channel_id: str
    sender_id: str
    text: str
    agent_id: str
