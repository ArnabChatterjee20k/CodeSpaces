import { serve } from "@hono/node-server";
import { Hono } from "hono";
import getCache from "./cache.js";
import { ASG } from "./asg.js";
import { getToken, verifyToken, type User } from "./auth.js";
import { ControlPlane, getControlPlane } from "./controlPlane.js";
import "dotenv/config";
import { Orchastrator } from "./orchastrator.js";

const app = new Hono();
const ORCHASTRATOR_TOKEN = process.env.ORCHASTRATOR_TOKEN!;
const AWS_REGION = process.env.AWS_REGION!;
ControlPlane.registerToken(ORCHASTRATOR_TOKEN);
ASG.setRegion(AWS_REGION);

const orchastrator = new Orchastrator()
// TODO: start the orchastrator syncing here

app.get("/", async (c) => {
  return c.text("Hello Hono!");
});

app.post("/user", async (c) => {
  const body = (await c.req.json()) as User;
  const token = getToken(body);
  c.status(201);
  return c.json({ token });
});

// to get the vscoder server url
app.get("/server", async (c) => {
  // TODO: use a distributed lock here with redis for instance id as a lock key so that during concurrency no double booking problem comes
  const freeInstance = await orchastrator.getFreeInstace();
  // TODO: check the cache with userid
  if(!freeInstance) return c.text("server is busy, try again");
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
