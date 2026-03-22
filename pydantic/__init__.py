from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any


class FieldInfo:
    def __init__(self, default: Any = None, default_factory=None):
        self.default = default
        self.default_factory = default_factory


def Field(default: Any = None, default_factory=None, **_: Any) -> FieldInfo:
    return FieldInfo(default=default, default_factory=default_factory)


class BaseModel:
    def __init__(self, **kwargs: Any):
        annotations = {}
        for cls in reversed(self.__class__.mro()):
            annotations.update(getattr(cls, '__annotations__', {}))
        for name in annotations:
            if name in kwargs:
                value = kwargs[name]
            else:
                attr = getattr(self.__class__, name, None)
                if isinstance(attr, FieldInfo):
                    if attr.default_factory is not None:
                        value = attr.default_factory()
                    else:
                        value = deepcopy(attr.default)
                else:
                    value = deepcopy(attr)
            setattr(self, name, value)

    def model_dump(self, exclude_none: bool = False) -> dict[str, Any]:
        data = {}
        annotations = {}
        for cls in reversed(self.__class__.mro()):
            annotations.update(getattr(cls, '__annotations__', {}))
        for name in annotations:
            value = getattr(self, name)
            if exclude_none and value is None:
                continue
            data[name] = _serialize(value)
        return data

    def model_copy(self, update: dict[str, Any] | None = None):
        payload = self.model_dump()
        payload.update(update or {})
        return self.__class__(**payload)

    def __iter__(self):
        return iter(self.model_dump().items())

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.model_dump()!r})"


def _serialize(value: Any):
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, datetime):
        return value.isoformat()
    return value
