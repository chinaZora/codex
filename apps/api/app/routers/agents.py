from fastapi import APIRouter
from shared_schema.models import AgentUpdateRequest
from app.services.agent_service import AgentService

router = APIRouter(prefix='/agents', tags=['agents'])
service = AgentService()


@router.get('')
def list_agents():
    return service.list_agents()


@router.get('/{agent_id}')
def get_agent(agent_id: str):
    return service.get_agent(agent_id)


@router.put('/{agent_id}')
def update_agent(agent_id: str, payload: AgentUpdateRequest):
    return service.update_agent(agent_id, payload)
