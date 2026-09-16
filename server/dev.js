import {createServer} from "node:http";
import health from "../api/health.js";
import validate from "../api/validate.js";
import auth from "../api/auth.js";
import projects from "../api/projects.js";
import media from "../api/media.js";
const routes = {"/api/media":media,"/api/auth":auth,"/api/projects":projects,"/api/health":health, "/api/validate":validate};
createServer(async (req, res) => {
  res.status = status => { res.statusCode = status; return res; };
  res.json = body => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  const handler = routes[new URL(req.url, "http://localhost").pathname];
  if (!handler) return res.status(404).json({error:"NOT_FOUND"});
  try { await handler(req, res); } catch { res.status(500).json({error:"INTERNAL_ERROR"}); }
}).listen(3001, "127.0.0.1", () => console.log("Cuebook API: http://127.0.0.1:3001"));
