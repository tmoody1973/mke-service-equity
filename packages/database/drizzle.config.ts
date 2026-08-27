import {defineConfig} from "drizzle-kit";
import {readMigrationDatabaseUrl} from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  dbCredentials: {
    url: readMigrationDatabaseUrl(process.env),
  },
});
