from shared_schema.models import AgentResponse, NormalizedIMMessage, SessionDebugRequest
from .base import BaseIMAdapter


class MockIMAdapter(BaseIMAdapter):
    adapter_name = 'mock'

    def normalize(self, payload: dict) -> NormalizedIMMessage:
        return NormalizedIMMessage(
            adapter=self.adapter_name,
            channel_id=payload['channel_id'],
            sender_id=payload['sender_id'],
            text=payload['text'],
            agent_id=payload['agent_id'],
        )

    def dispatch(self, payload: dict, runtime) -> AgentResponse:
        message = self.normalize(payload)
        return runtime.handle_message(SessionDebugRequest(
            session_id=payload.get('session_id', f"session-{message.channel_id}"),
            agent_id=message.agent_id,
            user_id=message.sender_id,
            message=message.text,
        ))
