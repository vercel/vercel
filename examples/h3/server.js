import { H3 } from "h3";

const app = new H3();

app.get("/", () => "Hello from H3!");

export default app
