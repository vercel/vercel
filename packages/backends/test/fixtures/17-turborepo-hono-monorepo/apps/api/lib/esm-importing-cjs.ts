import { sign } from "jsonwebtoken";

export const info = () => {
  return sign("info", "secret");
};
