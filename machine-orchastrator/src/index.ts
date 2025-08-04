import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { html } from "hono/html";
import getCache from "./cache.js";
import { ASG } from "./asg.js";
import { getToken, verifyToken, type User } from "./auth.js";
import { ControlPlane, getControlPlane } from "./controlPlane.js";
import { Orchastrator } from "./orchastrator.js";
import "dotenv/config";
import { cors } from "hono/cors";

const app = new Hono();
const ORCHASTRATOR_TOKEN = process.env.ORCHASTRATOR_TOKEN!;
const AWS_REGION = process.env.AWS_REGION!;

ControlPlane.registerToken(ORCHASTRATOR_TOKEN);
ASG.setRegion(AWS_REGION);

const orchastrator = new Orchastrator();
orchastrator.startSync();
app.use(cors({origin:"*"}));

app.get("/", (c) => {
  return c.html(
    html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Machine Orchastrator UI</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 2rem;
            }
            input,
            button {
              padding: 0.5rem;
              font-size: 1rem;
              margin: 0.5rem 0;
            }
            #output {
              margin-top: 1rem;
              font-family: monospace;
              color: green;
            }
          </style>
        </head>
        <body>
          <h2>Get Your Token</h2>
          <input type="text" id="userId" placeholder="Enter user_id" />
          <button onclick="getToken()">Get Token</button>

          <h2>Get Your Server</h2>
          <input type="text" id="tokenInput" placeholder="Enter token" />
          <button onclick="getServer()">Get Server URL</button>

          <div id="output"></div>

          <script>
            async function getToken() {
              const userId = document.getElementById("userId").value;
              const res = await fetch("/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId }),
              });
              const data = await res.json();
              document.getElementById("output").innerText = "Token: " + data.token;
              document.getElementById("tokenInput").value = data.token;
            }

            async function getServer() {
              const token = document.getElementById("tokenInput").value;
              const res = await fetch("/server?token=" + token);
              const text = await res.text();
              document.getElementById("output").innerText = "Server URL: " + text;
            }
          </script>
        </body>
      </html>
    `
  );
});

app.post("/user", async (c) => {
  const body = (await c.req.json()) as User;
  const token = getToken(body);
  c.status(201);
  return c.json({ token });
});

app.get("/server", async (c) => {
  const body = c.req.query();
  const token = body?.token;
  const user = verifyToken(token);
  if (!user) return c.text("invalid token");
  const userId = user.user_id;

  const cache = await getCache();
  const userInstance = await cache.get(`user:${userId}`);
  if (userInstance) {
    return c.text(userInstance);
  }

  const freeInstance = await orchastrator.getFreeInstace();
  if (!freeInstance) return c.text("server is busy, try again");

  const { ip } = freeInstance;
  const controlPlaneManager = getControlPlane()
  const controlPlane = controlPlaneManager.get(ip)
  const serverUrl = (await controlPlane.startContainer(userId))?.url
  
  await cache.set(`user:${userId}`, serverUrl);

  return c.text(serverUrl);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`🚀 Server is running on http://localhost:${info.port}`);
  }
);
