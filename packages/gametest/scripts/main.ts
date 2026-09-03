/**
 * QOL GameTests - in-game regression tests for every pack in the repo.
 *
 * DEV ONLY. `@minecraft/server-gametest` has no stable release, so this pack
 * needs the Beta APIs experiment and lives in a throwaway world. It is built
 * and deployed like the others but is never packaged into an .mcaddon.
 *
 * Enable this pack together with the packs under test, then:
 *
 *   /gametest runset qol          every test
 *   /gametest run qol:funnel_makes_concrete
 *
 * Results land in chat and the content log. Each test builds its own rig on
 * an all-air structure (tools/structures), so the rig is readable in the
 * suite file rather than locked in a binary.
 */
import "./suites/qoltimes";
import "./suites/fluidworks";
import "./suites/graves";
import "./suites/guardian";
import "./suites/hearthstone";
import "./suites/bulwark";
import "./suites/hatchling";

console.warn("[QOL GameTests] registered suite qol");
