import {createServer} from "node:http";
import health from "../api/health.js";
import validate from "../api/validate.js";
const routes = {"/api/health":health, "/api/validate":validate};
createServer(async (req, res) => {
  res.status = status => { res.statusCode = status; return res; };
  res.json = body => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  const handler = routes[new URL(req.url, "http://localhost").pathname];
  if (!handler) return res.status(404).json({error:"NOT_FOUND"});
  await handler(req, res);
}).listen(3001, "127.0.0.1", () => console.log("Cuebook API: http://127.0.0.1:3001"));
