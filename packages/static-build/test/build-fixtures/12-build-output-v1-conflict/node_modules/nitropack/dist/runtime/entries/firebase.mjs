import "#internal/nitro/virtual/polyfill";
import functions from "firebase-functions";
import { nitroApp } from "../app.mjs";
export const server = functions.https.onRequest(nitroApp.h3App.nodeHandler);
