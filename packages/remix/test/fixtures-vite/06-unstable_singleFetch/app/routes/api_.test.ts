export async function loader() {
  console.log("hello from api test");
  return Response.json({ success: true });
}
