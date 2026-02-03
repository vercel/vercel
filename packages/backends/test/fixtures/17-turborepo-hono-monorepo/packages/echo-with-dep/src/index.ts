import { sign } from "jsonwebtoken";
import cowsay from "cowsay";

export const echo = (message: string) => {
  console.log('cowsay', cowsay.say({ text: 'hello from the server' }))
  return sign(message, "secret");
};
