import {allowMethod, reply} from "../server/http.js";
export default function handler(req, res) {
  if (!allowMethod(req, res, "GET")) return;
  return reply(res, 200, {status:"ok", service:"cuebook-api", version:1});
}
