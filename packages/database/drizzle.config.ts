import {defineConfig} from "drizzle-kit";
import {readMigrationDatabaseUrl} from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: readMigrationDatabaseUrl(process.env),
  },
});
