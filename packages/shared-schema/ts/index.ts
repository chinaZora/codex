export type VisibilityScope = 'tenant' | 'department' | 'private' | 'public';

export interface AgentDefinition {
  tenant_id: string;
  department_id?: string | null;
  visibility_scope: VisibilityScope;
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  enabled_tools: string[];
  enabled_knowledge_sources: string[];
  output_style: string;
  status: string;
}
