from app.container import tool_registry


class ToolFacade:
    def list_tools(self):
        return tool_registry.list_tools()
