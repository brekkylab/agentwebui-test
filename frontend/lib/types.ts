export interface Document {
  id: string;
  name: string;
  size: number; // bytes
  uploadedAt: Date;
}

export interface Knowledge {
  id: string;
  name: string;
  description: string;
  documentIds: string[];
}

export interface SessionDocument {
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
  sessionDocuments: SessionDocument[];
}
