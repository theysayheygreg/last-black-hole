#!/usr/bin/env node
"use strict";

process.env.LBH_SOAK_PROFILE = "normal-45m";
process.env.LBH_SOAK_DIAGNOSTICS = "1";
require("./multiplayer-soak-smoke.cjs");
