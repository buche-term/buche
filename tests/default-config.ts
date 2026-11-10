// The default configuration (config/default.yaml), parsed by Bun (Vitest
// runs on Node, which has no YAML parser), as tests/setup.ts does.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BucheConfig } from "../src/config.ts";

const path = join(dirname(fileURLToPath(import.meta.url)), "../config/default.yaml");

export const defaultConfig: BucheConfig = JSON.parse(
    execFileSync(
        "bun",
        [
            "-e",
            "process.stdout.write(JSON.stringify(Bun.YAML.parse(await Bun.file(Bun.argv.at(-1)).text())))",
            path,
        ],
        { encoding: "utf8" },
    ),
);
