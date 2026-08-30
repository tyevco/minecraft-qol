import { argv, series, task, tscTask } from "just-scripts";
// Types must be imported with `import type`. just.config.ts is loaded as CJS via
// ts-node, and requiring the package's ESM build only resolves real runtime
// exports - listing a type here fails with "does not provide an export named".
import type {
  BundleTaskParameters,
  CopyTaskParameters,
  ZipTaskParameters,
} from "@minecraft/core-build-tasks";
import {
  bundleTask,
  cleanTask,
  cleanCollateralTask,
  copyTask,
  coreLint,
  mcaddonTask,
  setupEnvironment,
  watchTask,
  DEFAULT_CLEAN_DIRECTORIES,
  STANDARD_CLEAN_PATHS,
} from "@minecraft/core-build-tasks";
import path from "path";

setupEnvironment(path.resolve(__dirname, ".env"));

const projectName = "qol_times";
const isProduction = argv().production === true;

const bundleTaskOptions: BundleTaskParameters = {
  entryPoint: path.join(__dirname, "./scripts/main.ts"),
  // Resolved by the game at runtime from the manifest's `dependencies`, never
  // bundled. Anything imported here must appear in BOTH lists.
  external: ["@minecraft/server", "@minecraft/server-ui"],
  outfile: path.resolve(__dirname, "./dist/scripts/main.js"),
  minifyWhitespace: isProduction,
  sourcemap: !isProduction,
  outputSourcemapPath: path.resolve(__dirname, "./dist/debug"),
  // Lets us write `DEBUG: log.debug(...)` and have it stripped from release builds.
  dropLabels: isProduction ? ["DEBUG"] : [],
};

const copyTaskOptions: CopyTaskParameters = {
  copyToBehaviorPacks: [`./behavior_packs/${projectName}`],
  copyToScripts: ["./dist/scripts"],
  // No resource pack: this addon ships no textures, models or sounds.
};

const mcaddonTaskOptions: ZipTaskParameters = {
  ...copyTaskOptions,
  outputFile: `./dist/packages/${projectName}.mcaddon`,
};

task("clean-local", cleanTask(DEFAULT_CLEAN_DIRECTORIES));
task("clean-collateral", cleanCollateralTask(STANDARD_CLEAN_PATHS));
task("clean", series("clean-local", "clean-collateral"));
task("lint", coreLint(["scripts/**/*.ts"], argv().fix));
task("typescript", tscTask());
task("bundle", bundleTask(bundleTaskOptions));
task("build", series("typescript", "bundle"));
task("copyArtifacts", copyTask(copyTaskOptions));
task("package", series("clean-collateral", "copyArtifacts"));
task(
  "local-deploy",
  watchTask(
    ["scripts/**/*.ts", `behavior_packs/${projectName}/**/*`],
    series("clean-local", "build", "package"),
  ),
);
task("createMcaddonFile", mcaddonTask(mcaddonTaskOptions));
task("mcaddon", series("clean-local", "build", "createMcaddonFile"));
