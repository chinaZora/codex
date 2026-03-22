from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable
from shared_schema.models import ToolDefinition, ToolIO


@dataclass
class RegisteredTool:
    definition: ToolDefinition
    handler: Callable[[dict[str, Any]], dict[str, Any]]


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, definition: ToolDefinition, handler: Callable[[dict[str, Any]], dict[str, Any]]) -> None:
        self._tools[definition.id] = RegisteredTool(definition=definition, handler=handler)

    def get(self, tool_id: str) -> RegisteredTool:
        return self._tools[tool_id]

    def list_tools(self) -> list[ToolDefinition]:
        return [item.definition for item in self._tools.values()]


def build_default_registry() -> ToolRegistry:
    registry = ToolRegistry()

    def as_tool(tool_id: str, name: str, description: str, handler):
        registry.register(
            ToolDefinition(
                id=tool_id,
                name=name,
                description=description,
                input_schema=ToolIO(properties={'query': {'type': 'string'}}, required=['query']),
                output_schema=ToolIO(properties={'result': {'type': 'string'}}),
                permissions=['hr.read'],
            ),
            handler,
        )

    as_tool('candidate_lookup', 'Candidate Lookup', '查询候选人 mock 信息', lambda payload: {'result': f"候选人检索：{payload.get('query', '')} -> 张三，Java 开发，状态：一面完成"})
    as_tool('jd_lookup', 'JD Lookup', '查询岗位 JD mock 信息', lambda payload: {'result': f"JD 检索：{payload.get('query', '')} -> 招聘后端工程师，要求 Python/FastAPI"})
    as_tool('report_summary', 'Report Summary', '总结报表输入', lambda payload: {'result': f"报表总结：{payload.get('query', '')} -> 核心指标稳定，建议关注招聘漏斗转化"})
    as_tool('document_search', 'Document Search', '辅助文档检索', lambda payload: {'result': f"文档搜索：{payload.get('query', '')} -> 命中制度片段 2 条"})
    as_tool('artifact_outline_generator', 'Artifact Outline Generator', '生成 PPT 大纲草稿', lambda payload: {'result': f"PPT 大纲：封面 / 本周亮点 / 风险 / 下周计划，主题：{payload.get('query', '')}"})
    return registry
