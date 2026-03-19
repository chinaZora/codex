from shared_schema.models import NormalizedIMMessage


class BaseIMAdapter:
    adapter_name: str = 'base'

    def normalize(self, payload: dict) -> NormalizedIMMessage:
        raise NotImplementedError
