import { createStorageSnapshot, restoreStorageSnapshot } from "./storage-backup.js";

const [command, sourceRoot, destinationRoot] = process.argv.slice(2);

if (!command || !sourceRoot || !destinationRoot || !["backup", "restore"].includes(command)) {
  console.error("Usage: storage-backup <backup|restore> <source-or-snapshot> <destination>");
  process.exitCode = 2;
} else if (command === "backup") {
  const manifest = await createStorageSnapshot(sourceRoot, destinationRoot);
  console.log(`Storage snapshot created with ${manifest.entries.length} files.`);
} else {
  const result = await restoreStorageSnapshot(sourceRoot, destinationRoot);
  console.log(`Storage restored with ${result.manifest.entries.length} files.`);
  console.log(`Previous storage root kept at ${result.previousRoot}.`);
}
