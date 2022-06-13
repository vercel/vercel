import { StartServer, createHandler, renderAsync } from "solid-start/entry-server";
import { inlineServerModules } from "solid-start/server";

export default createHandler(
  inlineServerModules,
  renderAsync((context) => <StartServer context={context} />)
);
