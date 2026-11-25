import { type ResourceMetadata } from "xmcp";

export const metadata: ResourceMetadata = {
  name: "app-config",
  title: "Application Config",
  description: "Application configuration data",
};

export default function handler() {
  return "App configuration here";
}
