interface MemberIdentity {
  uid: string;
  email?: string;
  username?: string;
}

// Resolves a user-supplied identifier (uid, email, or username) to a uid,
// mirroring how team/project member commands accept flexible identifiers.
export function resolveMemberId(
  members: MemberIdentity[],
  identifier: string
): string | undefined {
  const needle = identifier.toLowerCase();
  const match = members.find(
    member =>
      member.uid === identifier ||
      member.email?.toLowerCase() === needle ||
      member.username?.toLowerCase() === needle
  );
  return match?.uid;
}
