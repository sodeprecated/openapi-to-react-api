#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yargs = require("yargs");
const chalk = require("chalk");
const boxen = require("boxen");

const { genData, genMethods } = require("./gen_core");

const usage = chalk.keyword("violet")(
  "\nUsage: openapi-to-ts-client [input] [options]\n" +
    boxen(chalk.green("Convert OpenAPI definition to typescript client"), {
      padding: 1,
      borderColor: "green",
      dimBorder: true,
    }) +
    "\n"
);

const options = yargs
  .usage(usage)
  .options("output", {
    alias: "o",
    describe: "Output directory",
    default: "./",
    type: "string",
  })
  .options("client", {
    alias: "c",
    describe: "Client filename",
    default: "api_client.ts",
    type: "string",
  })
  .options("contracts", {
    alias: "t",
    describe: "Contracts filename",
    default: "data_contracts.ts",
    type: "string",
  })
  .options("burl", {
    alias: "b",
    describe: "Base URL name",
    default: "API_BASE_URL",
    type: "string",
  })
  .options("fetch", {
    alias: "f",
    describe: "Fetch wrapper filename",
    default: "fetch_wrapper.ts",
    type: "string",
  })
  .help(true);

const input = yargs.argv._[0];
if (!input) {
  options
    .getHelp()
    .then(console.log)
    .finally(() => process.exit(1));
} else {
  const swaggerDocument = JSON.parse(
    fs.readFileSync(path.resolve(input), "utf8")
  );

  const gMethods = genMethods(
    swaggerDocument,
    // Strip the extension from the input file
    options.argv.contracts.replace(/\.[^/.]+$/, ""),
    options.argv.fetch.replace(/\.[^/.]+$/, ""),
    options.argv.burl
  );
  const gData = genData(swaggerDocument);

  if (!fs.existsSync(options.argv.output)) {
    fs.mkdirSync(options.argv.output, { recursive: true });
  }

  fs.writeFileSync(path.join(options.argv.output, options.argv.client), gMethods);
  fs.writeFileSync(path.join(options.argv.output, options.argv.contracts), gData);
}
