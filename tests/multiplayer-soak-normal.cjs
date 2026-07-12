#!/usr/bin/env node
"use strict";

process.env.LBH_SOAK_PROFILE = "normal-45m";
process.env.LBH_SOAK_DIAGNOSTICS = "1";
process.env.NODE_ENV = "test";
process.env.LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE = "1";
require("./multiplayer-soak-smoke.cjs");
