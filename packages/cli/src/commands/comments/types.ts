export interface ListThreadsParams {
  projectId?: string;
  branch?: string[];
  status?: 'resolved' | 'unresolved';
  page?: string[];
  author?: string[];
  contentId?: string[];
  search?: string;
  limit?: number;
  cursor?: string;
}

// Type alias (not interface) so it satisfies the client's JSONObject body
// type via implicit index signature compatibility.
export type MessageInput = {
  markdown?: string;
  attachments?: Array<{ url?: string; id?: string; name?: string }>;
};

export interface CommentActor {
  type: 'user' | 'app';
  id: string;
  username?: string;
  name?: string;
  avatar?: string;
}

export interface CommentAttachment {
  id: string;
  url: string;
  filename: string;
  width?: number;
  height?: number;
  mimeType?: string;
  size?: number;
}

export interface CommentReaction {
  name: string;
  emoji: string;
  users: CommentActor[];
  url?: string;
}

export interface CommentMessage {
  id: string;
  text: string;
  body: unknown[];
  timestamp: number;
  author: CommentActor;
  attachments?: CommentAttachment[];
  reactions?: CommentReaction[];
}

export interface ThreadContext {
  path?: string;
  pageTitle?: string;
  selection?: string;
  selector?: string;
  href?: string;
  frameworkContext?: string;
  device?: Record<string, unknown>;
}

export interface ThreadLink {
  type: string;
  label: string;
  link: string;
}

export interface Thread {
  id: string;
  resolved: boolean;
  resolvedBy?: CommentActor;
  isLocalhost: boolean;
  projectId: string;
  branch?: string;
  deploymentId?: string;
  contentId?: string;
  messageCount: number;
  messages: CommentMessage[];
  context?: ThreadContext;
  links?: ThreadLink[];
  webUrl?: string;
}

export interface ThreadsPagination {
  current?: number;
  next?: number;
  previous?: number;
  nextCursor?: string;
}

export interface ThreadsListResponse {
  pagination: ThreadsPagination;
  threads: Thread[];
}

export interface MessagesListResponse {
  pagination: ThreadsPagination;
  messages: CommentMessage[];
}

export interface CommentsScope {
  teamId: string;
  teamSlug?: string;
  projectId?: string;
  projectName?: string;
  /** True when the scope came from the cwd's project link. Branch inference
   * is only coherent when the project context and the git context share a
   * source — a branch from an unrelated checkout is noise, not context. */
  linked?: boolean;
}

export interface BranchFocus {
  value: string;
  source: 'flag' | 'git' | 'ci';
}
