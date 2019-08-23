import { Deployment } from '../../types';
import getScaleForDC from '../scale/get-scale-for-dc';

export default function shouldCopyScalingAttributes(
  origin: Deployment,
  dest: Deployment
) {
  if (origin.version === 2 || dest.version === 2) {
    return false;
  }

  return (
    (origin.type !== 'STATIC' &&
      getScaleForDC('bru1', origin).min !== getScaleForDC('bru1', dest).min) ||
    getScaleForDC('bru1', origin).max !== getScaleForDC('bru1', dest).max ||
    getScaleForDC('gru1', origin).min !== getScaleForDC('gru1', dest).min ||
    getScaleForDC('gru1', origin).max !== getScaleForDC('gru1', dest).max ||
    getScaleForDC('sfo1', origin).min !== getScaleForDC('sfo1', dest).min ||
    getScaleForDC('sfo1', origin).max !== getScaleForDC('sfo1', dest).max ||
    getScaleForDC('iad1', origin).min !== getScaleForDC('iad1', dest).min ||
    getScaleForDC('iad1', origin).max !== getScaleForDC('iad1', dest).max
  );
}
