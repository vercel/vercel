import { H3, serve } from "h3";

const app = new H3().get("/", () => "⚡️ Tadaa!");

serve(app);
