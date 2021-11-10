export default function listener(req: any, res: any) {
  res.status(404);
  res.send('not found');
}
