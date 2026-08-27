type DatabaseEnvironment = Record<string, string | undefined>;

function readDatabaseUrl(value: string | undefined, variableName: string): string {
  const databaseUrl = value?.trim();

  if (!databaseUrl) {
    throw new Error(`${variableName} is required`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(`${variableName} must be a PostgreSQL URL`);
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error(`${variableName} must be a PostgreSQL URL`);
  }

  return databaseUrl;
}

export function readRuntimeDatabaseUrl(environment: DatabaseEnvironment): string {
  return readDatabaseUrl(environment.DATABASE_URL, "DATABASE_URL");
}

export function readMigrationDatabaseUrl(environment: DatabaseEnvironment): string {
  if (environment.DATABASE_URL_UNPOOLED?.trim()) {
    return readDatabaseUrl(environment.DATABASE_URL_UNPOOLED, "DATABASE_URL_UNPOOLED");
  }

  return readRuntimeDatabaseUrl(environment);
}
