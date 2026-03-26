// --- Backend API Source/Knowledge Types ---

export interface ApiSource {
  id: string;
  name: string;
  source_type: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKnowledge {
  id: string;
  name: string;
  description: string;
  source_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface SessionSource {
  name: string;
  size: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  knowledgeIds: string[];
  sessionSources: SessionSource[];
}

// --- Backend API Response Types ---

export interface ApiProviderProfile {
  id: string;
  name: string;
  provider: {
    lm: {
      type: "api";
      schema: string;
      url: string;
      api_key?: string;
    };
    tools: unknown[];
  };
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiAgent {
  id: string;
  spec: {
    lm: string;
    instruction?: string;
    tools?: unknown[];
  };
  created_at: string;
  updated_at: string;
}

export interface ApiSessionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  created_at: string;
}

export interface ApiSession {
  id: string;
  agent_id: string;
  provider_profile_id: string;
  title: string | null;
  messages?: ApiSessionMessage[];
  created_at: string;
  updated_at: string;
}
