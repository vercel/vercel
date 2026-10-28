import output from '../../output-manager';
import type { Flag } from './types';

export function logArchivedFlagNotice(flag: Flag): void {
  if (flag.state === 'archived') {
    output.log(
      'This flag remains archived. Changes will not affect flag evaluation until it is unarchived.'
    );
  }
}
