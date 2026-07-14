"use strict";

const http = require("node:http");
const path = require("node:path");
const { createHostedProductRuntime } = require("./hosted-product-runtime.cjs");

function createHostedProductServer(options) {
  const runtime = createHostedProductRuntime(options);
  const server = http.createServer(runtime);
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  return server;
}

async function listenHostedProductServer(options) {
  const server = createHostedProductServer(options);
  const host = options.host || "127.0.0.1";
  const port = options.port == null ? 0 : Number(options.port);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new TypeError("invalid port");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

async function main() {
  const factoryModule = process.env.LBH_HOSTED_FACTORY_MODULE;
  if (!factoryModule || !path.isAbsolute(factoryModule)) throw new TypeError("absolute hosted composition factory required");
  const factory = require(factoryModule);
  if (!factory || typeof factory.createHostedComposition !== "function") throw new TypeError("hosted composition factory invalid");
  const composition = await factory.createHostedComposition({ env: process.env });
  const server = await listenHostedProductServer(composition);
  const address = server.address();
  process.stdout.write(`hosted product listening ${address.address}:${address.port}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`hosted product refused startup: ${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { createHostedProductServer, listenHostedProductServer };
