/**
 * World ID proof verification utilities for Vercel Functions
 * @module @vercel/functions/world-id
 */

export interface WorldIDProof {
  /** The nullifier hash - unique per user per action */
  nullifier_hash: string;
  /** The zero-knowledge proof */
  proof: string;
  /** The Merkle root of the World ID identity set */
  merkle_root: string;
  /** Verification level: 'orb' (biometric) or 'device' */
  verification_level?: 'orb' | 'device';
}

export interface WorldIDVerifyOptions {
  /** Your World ID App ID from developer.world.org */
  app_id: string;
  /** The action identifier you created in the Developer Portal */
  action: string;
  /** Optional signal (e.g. user ID) to bind the proof to */
  signal?: string;
  /** Your Relying Party ID (rp_id) - required for RP-based verification */
  rp_id?: string;
}

export interface WorldIDVerifyResult {
  /** Whether the proof was successfully verified */
  success: boolean;
  /** The nullifier hash (store this to prevent double-verification) */
  nullifier_hash?: string;
  /** Error code if verification failed */
  code?: string;
  /** Error detail if verification failed */
  detail?: string;
}

/**
 * Verify a World ID zero-knowledge proof on your Vercel Function backend.
 *
 * @example
 * ```ts
 * import { verifyWorldIDProof } from '@vercel/functions/world-id';
 *
 * export async function POST(req: Request) {
 *   const { proof, nullifier_hash, merkle_root } = await req.json();
 *
 *   const result = await verifyWorldIDProof(
 *     { nullifier_hash, proof, merkle_root },
 *     {
 *       app_id: process.env.WORLD_ID_APP_ID!,
 *       action: 'verify-human',
 *       rp_id: process.env.WORLD_ID_RP_ID,
 *     }
 *   );
 *
 *   if (!result.success) {
 *     return Response.json({ error: result.detail }, { status: 400 });
 *   }
 *
 *   return Response.json({ verified: true, nullifier_hash: result.nullifier_hash });
 * }
 * ```
 */
export async function verifyWorldIDProof(
  proof: WorldIDProof,
  options: WorldIDVerifyOptions
): Promise<WorldIDVerifyResult> {
  const { app_id, action, signal, rp_id } = options;

  // Build the verify endpoint URL
  const baseUrl = 'https://developer.world.org/api/v4';
  const endpoint = rp_id
    ? `${baseUrl}/verify/${rp_id}`
    : `${baseUrl}/verify/${app_id}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nullifier_hash: proof.nullifier_hash,
        proof: proof.proof,
        merkle_root: proof.merkle_root,
        verification_level: proof.verification_level ?? 'orb',
        action,
        signal,
        app_id,
      }),
    });

    const data = await response.json() as Record<string, unknown>;

    if (response.ok) {
      return {
        success: true,
        nullifier_hash: proof.nullifier_hash,
      };
    }

    return {
      success: false,
      code: data.code as string | undefined,
      detail: data.detail as string | undefined,
    };
  } catch (err) {
    return {
      success: false,
      code: 'fetch_error',
      detail: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Generate a World ID verification URL to redirect users to.
 * Useful for server-side redirects in Vercel Functions.
 *
 * @example
 * ```ts
 * import { getWorldIDVerificationURL } from '@vercel/functions/world-id';
 *
 * export async function GET(req: Request) {
 *   const { searchParams } = new URL(req.url);
 *   const userId = searchParams.get('user_id')!;
 *
 *   const verifyUrl = getWorldIDVerificationURL({
 *     app_id: process.env.WORLD_ID_APP_ID!,
 *     action: 'verify-human',
 *     signal: userId,
 *     redirect_url: 'https://myapp.com/verify/callback',
 *   });
 *
 *   return Response.redirect(verifyUrl);
 * }
 * ```
 */
export function getWorldIDVerificationURL(options: {
  app_id: string;
  action: string;
  signal?: string;
  redirect_url?: string;
}): string {
  const url = new URL('https://world.id/verify');
  url.searchParams.set('app_id', options.app_id);
  url.searchParams.set('action', options.action);
  if (options.signal) url.searchParams.set('signal', options.signal);
  if (options.redirect_url) url.searchParams.set('redirect_url', options.redirect_url);
  return url.toString();
}
