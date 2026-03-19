from fastapi import APIRouter
from shared_schema.models import ArtifactTaskRequest
from app.services.artifact_service import ArtifactFacade

router = APIRouter(prefix='/artifacts', tags=['artifacts'])
service = ArtifactFacade()


@router.post('')
def create_artifact(payload: ArtifactTaskRequest):
    return service.create_task(payload)
