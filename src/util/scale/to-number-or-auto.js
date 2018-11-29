//      
const AUTO         = 'auto';

export default function toNumberOrAuto(value        )                  {
  return value !== AUTO ? Number(value) : AUTO;
}
