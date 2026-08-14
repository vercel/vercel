import type Client from '../client';
import type { UpdateAttackModeResponse } from './types';

interface EnableAttackModeBody {
  projectId: string;
  attackModeEnabled: true;
  attackModeActiveUntil: number;
}

interface DisableAttackModeBody {
  projectId: string;
  attackModeEnabled: false;
}

type UpdateAttackModeBody = EnableAttackModeBody | DisableAttackModeBody;

export default async function updateAttackMode(
  client: Client,
  body: UpdateAttackModeBody
): Promise<UpdateAttackModeResponse> {
  return client.fetch<UpdateAttackModeResponse>('/security/attack-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
