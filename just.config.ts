import { argv, parallel, series, task, tscTask } from "just-scripts";
// Types must be imported with `import type`. just.config.ts is loaded as CJS via
// ts-node, and requiring the package's ESM build only resolves real runtime
// exports - listing a type here fails with "does not provide an export named".
import type { BundleTaskParameters, ZipTaskParameters } from "@minecraft/core-build-tasks";
import {
  bundleTask,
  cleanTask,
  copyFiles,
  coreLint,
  getGameDeploymentRootPaths,
  mcaddonTask,
  setupEnvironment,
  watchTask,
  DEFAULT_CLEAN_DIRECTORIES,
} from "@minecraft/core-build-tasks";
import path from "path";
import { rmSync } from "fs";

setupEnvironment(path.resolve(__dirname, ".env"));

const isProduction = argv().production === true;

interface Pack {
  /** Folder name in development_behavior_packs. Must match the manifest identity. */
  name: string;
  /** Source directory under packages/. */
  dir: string;
  /** Engine modules resolved at runtime. Must match the manifest's dependencies. */
  external: string[];
  /** Set when the pack also ships a resource_pack/ folder. */
  hasResourcePack?: boolean;
}

const PACKS: Pack[] = [
  {
    name: "qol_times",
    dir: "packages/qol-times",
    external: ["@minecraft/server", "@minecraft/server-ui"],
  },
  {
    name: "lens",
    dir: "packages/lens",
    // No server-ui: the Lens has no forms. Must match its manifest.
    external: ["@minecraft/server"],
  },
  {
    name: "hearthstone",
    dir: "packages/hearthstone",
    external: ["@minecraft/server"],
    hasResourcePack: true,
  },
  // Scaffolds: buildable and deployable, but nothing implemented yet.
  {
    name: "fluidworks",
    dir: "packages/fluidworks",
    external: ["@minecraft/server"],
  },
  {
    name: "bulwark",
    dir: "packages/bulwark",
    external: ["@minecraft/server"],
  },
];

/**
 * Resolve the game's deployment root from .env.
 *
 * MINECRAFT_PRODUCT selects which root to use; "Custom" reads
 * CUSTOM_DEPLOYMENT_PATH. Development packs load from the SHARED folder, not the
 * per-user one - see .env.example for the dangling-symlink trap on machines
 * migrated from the old UWP build.
 */
function deploymentRoot(): string {
  const product = process.env.MINECRAFT_PRODUCT ?? "BedrockGDK";
  const roots = getGameDeploymentRootPaths() as Record<string, string | undefined>;
  const root = roots[product];
  if (!root) {
    throw new Error(
      `No deployment path for MINECRAFT_PRODUCT="${product}". ` +
        `For "Custom", set CUSTOM_DEPLOYMENT_PATH in .env (forward slashes).`,
    );
  }
  return root;
}

/**
 * Deploy one pack.
 *
 * This deliberately replaces the library's copyTask, which reads PROJECT_NAME
 * from process.env inside its returned closure. That makes the destination a
 * process global, so two packs cannot be deployed from one just-scripts process
 * - the whole point of this repo. copyFiles and getGameDeploymentRootPaths are
 * the same helpers copyTask itself uses, minus the env coupling.
 */
function deployPack(pack: Pack): () => void {
  return () => {
    const root = deploymentRoot();
    const target = path.join(root, "development_behavior_packs", pack.name);
    console.log(`Deploying ${pack.name} -> ${target}`);
    copyFiles([path.join(pack.dir, "behavior_pack")], target);
    copyFiles([path.join("dist", pack.name, "scripts")], path.join(target, "scripts"));

    if (pack.hasResourcePack) {
      // Resource packs live in a sibling folder under the same com.mojang root.
      const rpTarget = path.join(root, "development_resource_packs", pack.name);
      console.log(`Deploying ${pack.name} RP -> ${rpTarget}`);
      copyFiles([path.join(pack.dir, "resource_pack")], rpTarget);
      console.log(
        `  note: resource changes do NOT hot-reload. /reload will not show them - ` +
          `exit to the main menu and re-enter, or restart for manifest changes.`,
      );
    }
  };
}

/** Remove only this pack's deploy targets, never a sibling's. */
function cleanPack(pack: Pack): () => void {
  return () => {
    const root = deploymentRoot();
    rmSync(path.join(root, "development_behavior_packs", pack.name), {
      recursive: true,
      force: true,
    });
    if (pack.hasResourcePack) {
      // A stale resource pack is harder to notice than a stale behavior pack -
      // it keeps loading and shadowing the new one with no error anywhere.
      rmSync(path.join(root, "development_resource_packs", pack.name), {
        recursive: true,
        force: true,
      });
    }
  };
}

// Defined before the loop: just/undertaker resolves task names eagerly inside
// series(), so a task referenced by a per-pack task must already exist.
task("typescript", tscTask());

for (const pack of PACKS) {
  const bundleOptions: BundleTaskParameters = {
    entryPoint: path.join(__dirname, pack.dir, "scripts/main.ts"),
    external: pack.external,
    outfile: path.resolve(__dirname, `./dist/${pack.name}/scripts/main.js`),
    minifyWhitespace: isProduction,
    sourcemap: !isProduction,
    outputSourcemapPath: path.resolve(__dirname, `./dist/${pack.name}/debug`),
    // Lets us write `DEBUG: log(...)` and have it stripped from release builds.
    dropLabels: isProduction ? ["DEBUG"] : [],
    // Shared code is bundled into each pack. Packs cannot share a runtime module,
    // so a copy per pack is correct, not wasteful.
    alias: { "@qol/shared": path.resolve(__dirname, "packages/shared") },
  };

  const mcaddonOptions: ZipTaskParameters = {
    copyToBehaviorPacks: [`./${pack.dir}/behavior_pack`],
    copyToScripts: [`./dist/${pack.name}/scripts`],
    // The RP .mcpack is only added to the .mcaddon when this is non-empty.
    ...(pack.hasResourcePack ? { copyToResourcePacks: [`./${pack.dir}/resource_pack`] } : {}),
    outputFile: `./dist/packages/${pack.name}.mcaddon`,
  };

  task(`bundle:${pack.name}`, bundleTask(bundleOptions));
  task(`deploy:${pack.name}`, deployPack(pack));
  task(`clean:${pack.name}`, cleanPack(pack));
  task(`mcaddon:${pack.name}`, mcaddonTask(mcaddonOptions));
  task(`build:${pack.name}`, series("typescript", `bundle:${pack.name}`));
  task(`local-deploy:${pack.name}`, series(`build:${pack.name}`, `deploy:${pack.name}`));
}

const packNames = PACKS.map((p) => p.name);

task("lint", coreLint(["packages/**/*.ts"], argv().fix));
task("clean-local", cleanTask(DEFAULT_CLEAN_DIRECTORIES));
task("clean", series("clean-local", ...packNames.map((n) => `clean:${n}`)));

task("bundle", parallel(...packNames.map((n) => `bundle:${n}`)));
task("build", series("typescript", "bundle"));
task("deploy", series(...packNames.map((n) => `deploy:${n}`)));
task("package", series("build", "deploy"));
task("mcaddon", series("build", ...packNames.map((n) => `mcaddon:${n}`)));

task(
  "local-deploy",
  watchTask(
    ["packages/**/*.ts", "packages/**/behavior_pack/**/*", "packages/**/resource_pack/**/*"],
    series("build", "deploy"),
  ),
);
