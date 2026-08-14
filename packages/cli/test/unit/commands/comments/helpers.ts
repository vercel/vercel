import { vi } from 'vitest';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import type {
  CommentMessage,
  Thread,
} from '../../../../src/commands/comments/types';

export const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
export const mockedGetScope = vi.mocked(getScopeModule.default);

export function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_comments',
      name: 'comments-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  } as Awaited<ReturnType<typeof linkModule.getLinkedProject>>);
}

export function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' },
    user: { id: 'user_dummy', username: 'jane' },
  } as unknown as Awaited<ReturnType<typeof getScopeModule.default>>);
}

export function makeMessage(
  overrides: Partial<CommentMessage> = {}
): CommentMessage {
  return {
    id: 'msg_1',
    text: 'can u read the text?',
    body: [],
    timestamp: Date.now() - 3 * 60 * 1000,
    author: { type: 'user', id: 'user_dummy', name: 'Jane Doe' },
    ...overrides,
  };
}

export function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'icZ9BnPPINuK',
    resolved: false,
    isLocalhost: false,
    projectId: 'prj_comments',
    branch: 'feat-x',
    messageCount: 1,
    messages: [makeMessage()],
    context: {
      path: '/',
      href: 'https://example.com/docs/sandbox',
      selection: 'The sandbox is a per-chat',
    },
    webUrl: 'https://vercel.com/my-team/comments-project/c/icZ9BnPPINuK?s=15',
    ...overrides,
  };
}
