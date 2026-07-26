"use strict";

const http = require("http");

const DEFAULT_MAX_BODY_CHARS = 1024 * 1024;

function createJsonHttpLifecycle({
  serialize,
  allowedHeaders = [],
  maxBodyChars = DEFAULT_MAX_BODY_CHARS,
}) {
  const corsHeaders = ["content-type", ...allowedHeaders].join(",");

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
        if (data.length > maxBodyChars) {
          reject(new Error("Request body too large"));
          req.destroy();
        }
      });
      req.on("end", () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
      req.on("error", reject);
    });
  }

  function sendJson(res, statusCode, body) {
    const payload = serialize(body);
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", corsHeaders);
    res.end(payload);
  }

  function createServer(routeRequest) {
    return http.createServer(async (req, res) => {
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", corsHeaders);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.end();
        return;
      }
      try {
        await routeRequest(req, res);
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error.message });
      }
    });
  }

  return { readJson, sendJson, createServer };
}

module.exports = { createJsonHttpLifecycle };
