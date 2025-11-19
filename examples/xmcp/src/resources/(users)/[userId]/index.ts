import { z } from "zod";
import { type ResourceMetadata, type InferSchema } from "xmcp";

export const schema = {
  userId: z.string().describe("The ID of the user"),
};

export const metadata: ResourceMetadata = {
  name: "user-profile",
  title: "User Profile",
  description: "User profile information",
};

export default function handler({ userId }: InferSchema<typeof schema>) {
  return `Profile data for user ${userId}`;
}
