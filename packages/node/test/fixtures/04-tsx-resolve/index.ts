import dep from './dep';

export default function handler(req: any, res: any) {
  res.end(dep);
}
