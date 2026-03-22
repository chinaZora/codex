from shared_schema.models import AgentDefinition, MemoryPolicy, Guardrails


def build_default_templates() -> dict[str, AgentDefinition]:
    return {
        'recruiter-assistant': AgentDefinition(
            id='recruiter-assistant',
            name='招聘群助手',
            description='用于招聘群里的候选人、JD 查询与问题总结。',
            system_prompt='你是 HR 招聘群助手，要先给结论，再给建议。',
            enabled_tools=['candidate_lookup', 'jd_lookup', 'report_summary'],
            enabled_knowledge_sources=['hr-policy-handbook'],
            memory_policy=MemoryPolicy(enable_short_term=True, enable_long_term=True, session_window=8),
            output_style='简洁行动建议',
            guardrails=Guardrails(),
        ),
        'policy-knowledge': AgentDefinition(
            id='policy-knowledge',
            name='制度知识助手',
            description='用于检索制度文档并回答带引用的知识问答。',
            system_prompt='你是制度知识助手，回答必须基于知识片段，并返回引用。',
            enabled_tools=['document_search'],
            enabled_knowledge_sources=['hr-policy-handbook'],
            memory_policy=MemoryPolicy(enable_short_term=True, enable_long_term=False, session_window=6),
            output_style='带引用',
            guardrails=Guardrails(),
        ),
        'report-summarizer': AgentDefinition(
            id='report-summarizer',
            name='报表总结助手',
            description='用于汇总日报/周报风格结论并输出 PPT 大纲草稿。',
            system_prompt='你是报表总结助手，要归纳亮点、风险和建议动作。',
            enabled_tools=['report_summary', 'artifact_outline_generator'],
            enabled_knowledge_sources=[],
            memory_policy=MemoryPolicy(enable_short_term=True, enable_long_term=True, session_window=10),
            output_style='管理摘要',
            guardrails=Guardrails(),
        ),
    }
