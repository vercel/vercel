export default function handler (req: any, res: any) {
  try {
    if (req) {
      throw new Error(`Should throw`);
    }
    res.end(`Should not print`);
  } catch (error) {
    res.end(error.stack);
  }
}
