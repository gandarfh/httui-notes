import { execSync } from "child_process";
import { renameSync, mkdirSync } from "fs";

const ext = process.platform === "win32" ? ".exe" : "";
const targetTriple = execSync("rustc --print host-tuple").toString().trim();
const src = `claude-sidecar${ext}`;
const destDir = "../httui-desktop/src-tauri/binaries";
const dest = `${destDir}/claude-sidecar-${targetTriple}${ext}`;

mkdirSync(destDir, { recursive: true });
renameSync(src, dest);
console.log(`Renamed ${src} → ${dest}`);
