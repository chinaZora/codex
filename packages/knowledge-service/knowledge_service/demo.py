from shared_schema.models import KnowledgeSource, KnowledgeChunk


def load_demo_sources() -> tuple[list[KnowledgeSource], list[KnowledgeChunk]]:
    source = KnowledgeSource(
        id='hr-policy-handbook',
        name='HR 制度手册',
        description='用于制度知识问答演示的 demo 文档源',
    )
    chunks = [
        KnowledgeChunk(id='chunk-1', source_id=source.id, content='员工转正申请需在试用期结束前 7 天由直属经理发起。', metadata={'section': '转正流程'}),
        KnowledgeChunk(id='chunk-2', source_id=source.id, content='年假按照入职年限分层配置，系统会在每年 1 月自动刷新额度。', metadata={'section': '休假制度'}),
        KnowledgeChunk(id='chunk-3', source_id=source.id, content='招聘 offer 发放前需完成薪酬审批与 HC 校验。', metadata={'section': '招聘制度'}),
    ]
    return [source], chunks
