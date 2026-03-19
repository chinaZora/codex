from fastapi import APIRouter
from app.services.tool_service import ToolFacade

router = APIRouter(prefix='/tools', tags=['tools'])
service = ToolFacade()


@router.get('')
def list_tools():
    return service.list_tools()
