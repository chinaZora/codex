from __future__ import annotations

import os
from typing import Any
from pydantic import BaseModel


class SettingsConfigDict(dict):
    pass


class BaseSettings(BaseModel):
    def __init__(self, **kwargs: Any):
        annotations = {}
        for cls in reversed(self.__class__.mro()):
            annotations.update(getattr(cls, '__annotations__', {}))
        payload = {}
        for name in annotations:
            env_name = name.upper()
            if env_name in os.environ:
                payload[name] = os.environ[env_name]
        payload.update(kwargs)
        super().__init__(**payload)
