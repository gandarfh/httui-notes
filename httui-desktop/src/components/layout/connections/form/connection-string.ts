import type { Driver, DriverConfigEntry } from "./DriverSelector";
import { DRIVER_CONFIG } from "./DriverSelector";

/** Build the read-only connection-string preview shown above the
 * advanced fields. Pure: takes the user's current form values and
 * returns the URI a backend would build. SQLite skips the URI shape
 * because the file path *is* the connection string. */
export function buildConnectionPreview(
  driver: Driver,
  host: string,
  port: string,
  dbName: string,
  username: string,
): string {
  if (driver === "sqlite") return dbName || "path/to/database.db";
  const cfg: DriverConfigEntry = DRIVER_CONFIG[driver];
  const user = username || "user";
  const h = host || "localhost";
  const p = port || cfg.defaultPort;
  const db = dbName || "database";
  return `${driver}://${user}@${h}:${p}/${db}`;
}
