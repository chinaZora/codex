from datetime import datetime, timezone
from shared_schema.models import ArtifactTask, ArtifactTaskRequest


class ArtifactFacade:
    def create_task(self, payload: ArtifactTaskRequest) -> ArtifactTask:
        return ArtifactTask(
            id=f"artifact-{int(datetime.now(tz=timezone.utc).timestamp())}",
            tenant_id=payload.tenant_id,
            agent_id=payload.agent_id,
            session_id=payload.session_id,
            artifact_type=payload.artifact_type,
            status="queued",
            prompt=payload.prompt,
        )
