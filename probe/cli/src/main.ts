#!/usr/bin/env node
import { InvalidOptionsError, SafetyRefusalError, parseOptions } from "./options.js";
import { EXIT_CODES, runProbe } from "./runner.js";

const result = (() => {
  try {
    return runProbe(parseOptions(process.argv.slice(2)));
  } catch (error) {
    const code = error instanceof SafetyRefusalError ? EXIT_CODES.safety : EXIT_CODES.invalid;
    if (error instanceof InvalidOptionsError || error instanceof SafetyRefusalError)
      console.error(error.message);
    return Promise.resolve({ exitCode: code });
  }
})();

const completed = await result;
if (completed.exitCode !== EXIT_CODES.complete) {
  for (const error of "errors" in completed ? completed.errors : [])
    console.error(`${error.code}: ${error.message}`);
}
process.exitCode = completed.exitCode;
