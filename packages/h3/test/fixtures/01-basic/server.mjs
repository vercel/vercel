import { H3 } from "h3";

const app = new H3();

app.get("/", () => "Hello World!");

export default app
