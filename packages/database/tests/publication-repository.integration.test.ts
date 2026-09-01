import {randomBytes, randomUUID} from "node:crypto";
import {sql, type SQL} from "drizzle-orm";
import {describe, expect, it} from "vitest";
import {createDatabaseClient} from "../src/client";
import {readRuntimeDatabaseUrl} from "../src/env";

type Database = ReturnType<typeof createDatabaseClient>;

type SourceEvidence = {
  sourceFoodRunId: string;
  sourceBaselineRunId: string;
  sourceFoodOutputHash: string;
  sourceBaselineOutputHash: string;
  sourceFoodScoreId: string;
  sourceEquityScoreId: string;
  sourceEquityComponentId: string;
  sourceFoodComponentId: string;
  snapshotId: string;
  resourceVersionId: string;
};

type FixtureRun = {
  runId: string;
  outputHash: string;
  scoreId: string;
  componentId: string;
  accessMetricValueId: string;
};

type Fixture = {
  source: SourceEvidence;
  baselineRunId: string;
  baselineOutputHash: string;
  equityScoreId: string;
  equityComponentId: string;
  indicatorValueId: string;
  geographyId: string;
  foodRuns: [FixtureRun, FixtureRun, FixtureRun];
};

function hash() {
  return randomBytes(32).toString("hex");
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }
  return value;
}

async function sourceEvidence(database: Database): Promise<SourceEvidence> {
  const result = await database.execute(sql`
    select
      food.id as source_food_run_id,
      baseline.id as source_baseline_run_id,
      food.output_hash as source_food_output_hash,
      baseline.output_hash as source_baseline_output_hash,
      food_score.id as source_food_score_id,
      equity_score.id as source_equity_score_id,
      equity_component.id as source_equity_component_id,
      food_component.id as source_food_component_id,
      snapshot.id as snapshot_id,
      resource_version.id as resource_version_id
    from food_score_runs food
    join score_runs baseline on baseline.id = food.equity_baseline_run_id
    join food_scores food_score on food_score.food_score_run_id = food.id
    join scores equity_score on equity_score.id = food_score.equity_baseline_score_id
    join lateral (
      select component.*
      from score_components component
      where component.score_run_id = baseline.id
        and component.geography_id = food_score.geography_id
      order by component.id
      limit 1
    ) equity_component on true
    join indicator_values indicator_value on indicator_value.id = equity_component.indicator_value_id
    join source_snapshots snapshot on snapshot.id = indicator_value.snapshot_id
      and snapshot.validation_status = 'valid'
    join lateral (
      select component.*
      from food_score_components component
      where component.food_score_run_id = food.id
        and component.geography_id = food_score.geography_id
      order by component.id
      limit 1
    ) food_component on true
    cross join lateral (
      select version.id
      from food_resource_versions version
      order by version.created_at, version.id
      limit 1
    ) resource_version
    where food.status = 'validated'
      and baseline.status = 'validated'
    order by food.created_at desc, food_score.geography_id
    limit 1
  `);
  const row = result.rows[0];
  if (!row) {
    throw new Error("No validated source run is available for publication fixtures");
  }
  return {
    sourceFoodRunId: requiredString(row, "source_food_run_id"),
    sourceBaselineRunId: requiredString(row, "source_baseline_run_id"),
    sourceFoodOutputHash: requiredString(row, "source_food_output_hash"),
    sourceBaselineOutputHash: requiredString(row, "source_baseline_output_hash"),
    sourceFoodScoreId: requiredString(row, "source_food_score_id"),
    sourceEquityScoreId: requiredString(row, "source_equity_score_id"),
    sourceEquityComponentId: requiredString(row, "source_equity_component_id"),
    sourceFoodComponentId: requiredString(row, "source_food_component_id"),
    snapshotId: requiredString(row, "snapshot_id"),
    resourceVersionId: requiredString(row, "resource_version_id"),
  };
}

async function createFixture(database: Database): Promise<Fixture> {
  const source = await sourceEvidence(database);
  const baselineRunId = randomUUID();
  const baselineOutputHash = hash();
  const equityScoreId = randomUUID();
  const equityComponentId = randomUUID();

  await database.execute(sql`
    insert into score_runs (
      id, methodology_version, registry_hash, input_manifest_hash, run_fingerprint,
      scoring_implementation_version, started_at, completed_at, data_vintages,
      git_commit, status, validation_result, failure_metadata, output_hash, created_at
    )
    select
      ${baselineRunId}::uuid, methodology_version, registry_hash, input_manifest_hash,
      ${hash()}::char(64), scoring_implementation_version, transaction_timestamp(), null,
      data_vintages, 'publication-integration-fixture', 'draft', null, null, null,
      transaction_timestamp()
    from score_runs
    where id = ${source.sourceBaselineRunId}::uuid
  `);
  await database.execute(sql`
    insert into scores (
      id, score_run_id, geography_id, demographic_score, socioeconomic_score,
      health_score, composite_score, equity_baseline_percentile,
      equity_baseline_band, quality_status, created_at
    )
    select
      ${equityScoreId}::uuid, ${baselineRunId}::uuid, geography_id,
      demographic_score, socioeconomic_score, health_score, composite_score,
      equity_baseline_percentile, equity_baseline_band, quality_status,
      transaction_timestamp()
    from scores
    where id = ${source.sourceEquityScoreId}::uuid
  `);
  await database.execute(sql`
    insert into score_components (
      id, score_run_id, geography_id, indicator_value_id, indicator_percentile,
      effective_weight, quality_status, created_at
    )
    select
      ${equityComponentId}::uuid, ${baselineRunId}::uuid, geography_id,
      indicator_value_id, indicator_percentile, effective_weight, quality_status,
      transaction_timestamp()
    from score_components
    where id = ${source.sourceEquityComponentId}::uuid
  `);
  await database.execute(sql`
    update score_runs
    set status = 'validated', completed_at = transaction_timestamp(),
        validation_result = '{"fixture":true}'::jsonb,
        output_hash = ${baselineOutputHash}::char(64)
    where id = ${baselineRunId}::uuid
  `);

  const equityMember = await database.execute(sql`
    select score.geography_id, component.indicator_value_id
    from scores score
    join score_components component
      on component.score_run_id = score.score_run_id
      and component.geography_id = score.geography_id
    where score.id = ${equityScoreId}::uuid
      and component.id = ${equityComponentId}::uuid
  `);
  const geographyId = requiredString(equityMember.rows[0]!, "geography_id");
  const indicatorValueId = requiredString(equityMember.rows[0]!, "indicator_value_id");

  const foodRuns: FixtureRun[] = [];
  for (let index = 0; index < 3; index += 1) {
    const runId = randomUUID();
    const outputHash = hash();
    const scoreId = randomUUID();
    const componentId = randomUUID();

    await database.execute(sql`
      insert into food_score_runs (
        id, methodology_version, registry_hash, input_manifest_hash, run_fingerprint,
        scoring_implementation_version, equity_baseline_run_id,
        equity_baseline_output_hash, started_at, completed_at, data_vintages,
        git_commit, status, validation_result, failure_metadata, output_hash, created_at
      )
      select
        ${runId}::uuid, methodology_version, registry_hash, input_manifest_hash,
        ${hash()}::char(64), scoring_implementation_version, ${baselineRunId}::uuid,
        ${baselineOutputHash}::char(64), transaction_timestamp(), null, data_vintages,
        'publication-integration-fixture', 'draft', null, null, null,
        transaction_timestamp()
      from food_score_runs
      where id = ${source.sourceFoodRunId}::uuid
    `);
    await database.execute(sql`
      insert into food_scores (
        id, food_score_run_id, geography_id, equity_baseline_score_id,
        retail_access_score, transportation_constraint_score, raw_food_access_need,
        food_access_need_percentile, food_access_need_band, equity_baseline_band,
        priority, quality_status, exclusion_reasons, created_at
      )
      select
        ${scoreId}::uuid, ${runId}::uuid, geography_id, ${equityScoreId}::uuid,
        retail_access_score, transportation_constraint_score, raw_food_access_need,
        food_access_need_percentile, food_access_need_band, equity_baseline_band,
        priority, quality_status, exclusion_reasons, transaction_timestamp()
      from food_scores
      where id = ${source.sourceFoodScoreId}::uuid
    `);
    await database.execute(sql`
      insert into food_score_components (
        id, food_score_run_id, geography_id, access_metric_value_id, domain,
        indicator_percentile, effective_weight, quality_status, created_at
      )
      select
        ${componentId}::uuid, ${runId}::uuid, geography_id, access_metric_value_id,
        domain, indicator_percentile, effective_weight, quality_status,
        transaction_timestamp()
      from food_score_components
      where id = ${source.sourceFoodComponentId}::uuid
    `);
    await database.execute(sql`
      update food_score_runs
      set status = 'validated', completed_at = transaction_timestamp(),
          validation_result = '{"fixture":true}'::jsonb,
          output_hash = ${outputHash}::char(64)
      where id = ${runId}::uuid
    `);
    const component = await database.execute(sql`
      select access_metric_value_id
      from food_score_components
      where id = ${componentId}::uuid
    `);
    foodRuns.push({
      runId,
      outputHash,
      scoreId,
      componentId,
      accessMetricValueId: requiredString(component.rows[0]!, "access_metric_value_id"),
    });
  }

  return {
    source,
    baselineRunId,
    baselineOutputHash,
    equityScoreId,
    equityComponentId,
    indicatorValueId,
    geographyId,
    foodRuns: foodRuns as [FixtureRun, FixtureRun, FixtureRun],
  };
}

type PublishInput = {
  fixture: Fixture;
  food: FixtureRun;
  publicationId: string;
  expectedCurrentPublicationId: string | null;
  idempotencyKey: string;
  bundleFingerprint: string;
  dryRunHash: string;
  auditEventId?: string;
  scoreMembers?: Array<Record<string, string>>;
  redistributionDecision?: "public_derived_results" | "prohibited_public_use";
};

function publishStatement(input: PublishInput): SQL {
  const {fixture, food} = input;
  const scores = input.scoreMembers ?? [
    {
      geography_id: fixture.geographyId,
      food_score_id: food.scoreId,
      equity_score_id: fixture.equityScoreId,
    },
  ];
  const equityComponents = [
    {component_id: fixture.equityComponentId, indicator_value_id: fixture.indicatorValueId},
  ];
  const foodComponents = [
    {component_id: food.componentId, access_metric_value_id: food.accessMetricValueId},
  ];
  const decision = input.redistributionDecision ?? "public_derived_results";
  const snapshots = [
    {
      snapshot_id: fixture.source.snapshotId,
      role: "equity_input",
      redistribution_decision: decision,
      terms_url: "https://example.invalid/source-terms",
      attribution: "Disposable integration fixture based on validated project inputs",
      warning: null,
    },
  ];
  const resources = [
    {
      resource_version_id: fixture.source.resourceVersionId,
      role: "scoring_inventory",
      redistribution_decision: decision,
      terms_url: "https://example.invalid/resource-terms",
      attribution: "Disposable integration fixture based on validated project inputs",
      warning: null,
    },
  ];

  return sql`
    select publish_atlas_release(
      ${input.publicationId}::uuid,
      ${food.runId}::uuid,
      ${input.expectedCurrentPublicationId}::uuid,
      ${input.bundleFingerprint}::char(64),
      ${input.dryRunHash}::char(64),
      'MOO-768-integration',
      ${input.idempotencyKey}::uuid,
      'integration-test',
      'controlled-database-function',
      '1',
      'publication-integration-fixture',
      'Verify the governed publication lifecycle',
      '{"fixture":true}'::jsonb,
      ${JSON.stringify(scores)}::jsonb,
      ${JSON.stringify(equityComponents)}::jsonb,
      ${JSON.stringify(foodComponents)}::jsonb,
      ${JSON.stringify(snapshots)}::jsonb,
      ${JSON.stringify(resources)}::jsonb,
      ${input.auditEventId ?? randomUUID()}::uuid,
      'development'::publication_environment,
      ${hash()}::char(64)
    ) as publication_id
  `;
}

describe.skipIf(!process.env.DATABASE_URL)("publication repository integration", () => {
  it("publishes, retries, replaces, rejects invalid releases, and withdraws atomically", async () => {
    const database = createDatabaseClient(readRuntimeDatabaseUrl(process.env));
    const fixture = await createFixture(database);
    const [foodA, foodB, foodC] = fixture.foodRuns;
    const publicationA = randomUUID();
    const publicationB = randomUUID();
    const idempotencyA = randomUUID();
    const bundleA = hash();
    const dryRunA = hash();

    const first = await database.execute(
      publishStatement({
        fixture,
        food: foodA,
        publicationId: publicationA,
        expectedCurrentPublicationId: null,
        idempotencyKey: idempotencyA,
        bundleFingerprint: bundleA,
        dryRunHash: dryRunA,
      }),
    );
    expect(first.rows).toEqual([{publication_id: publicationA}]);

    const retry = await database.execute(
      publishStatement({
        fixture,
        food: foodA,
        publicationId: randomUUID(),
        expectedCurrentPublicationId: null,
        idempotencyKey: idempotencyA,
        bundleFingerprint: bundleA,
        dryRunHash: dryRunA,
      }),
    );
    expect(retry.rows).toEqual([{publication_id: publicationA}]);
    const retryAudit = await database.execute(sql`
      select count(*)::integer as event_count
      from atlas_publication_audit_events
      where idempotency_key = ${idempotencyA}::uuid
        and outcome = 'succeeded'
    `);
    expect(retryAudit.rows).toEqual([{event_count: 1}]);

    await expect(
      database.execute(
        publishStatement({
          fixture,
          food: foodB,
          publicationId: randomUUID(),
          expectedCurrentPublicationId: publicationA,
          idempotencyKey: idempotencyA,
          bundleFingerprint: hash(),
          dryRunHash: hash(),
        }),
      ),
    ).rejects.toThrow();

    await database.execute(
      publishStatement({
        fixture,
        food: foodB,
        publicationId: publicationB,
        expectedCurrentPublicationId: publicationA,
        idempotencyKey: randomUUID(),
        bundleFingerprint: hash(),
        dryRunHash: hash(),
      }),
    );
    const replacement = await database.execute(sql`
      select id, state::text, superseded_by_publication_id
      from atlas_publications
      where id in (${publicationA}::uuid, ${publicationB}::uuid)
      order by id
    `);
    expect(replacement.rows).toEqual(
      expect.arrayContaining([
        {id: publicationA, state: "superseded", superseded_by_publication_id: publicationB},
        {id: publicationB, state: "published", superseded_by_publication_id: null},
      ]),
    );

    await expect(
      database.execute(
        publishStatement({
          fixture,
          food: foodC,
          publicationId: randomUUID(),
          expectedCurrentPublicationId: publicationB,
          idempotencyKey: randomUUID(),
          bundleFingerprint: hash(),
          dryRunHash: hash(),
          scoreMembers: [],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      database.execute(
        publishStatement({
          fixture,
          food: foodC,
          publicationId: randomUUID(),
          expectedCurrentPublicationId: publicationB,
          idempotencyKey: randomUUID(),
          bundleFingerprint: hash(),
          dryRunHash: hash(),
          redistributionDecision: "prohibited_public_use",
        }),
      ),
    ).rejects.toThrow();

    const afterRejections = await database.execute(sql`
      select
        (select id from atlas_publications where state = 'published') as current_id,
        (select status::text from food_score_runs where id = ${foodB.runId}::uuid) as current_food_status,
        (select status::text from food_score_runs where id = ${foodC.runId}::uuid) as rejected_food_status
    `);
    expect(afterRejections.rows).toEqual([
      {
        current_id: publicationB,
        current_food_status: "published",
        rejected_food_status: "validated",
      },
    ]);

    await expect(
      database.execute(sql`
        update food_scores
        set created_at = created_at + interval '1 second'
        where id = ${foodB.scoreId}::uuid
      `),
    ).rejects.toThrow();
    await expect(
      database.execute(sql`
        delete from atlas_publication_score_members
        where publication_id = ${publicationB}::uuid
      `),
    ).rejects.toThrow();
    await expect(
      database.execute(sql`
        update food_score_runs
        set status = 'validated'
        where id = ${foodB.runId}::uuid
      `),
    ).rejects.toThrow();

    const withdrawal = await database.execute(sql`
      select withdraw_atlas_release(
        ${publicationB}::uuid,
        'MOO-768-integration',
        ${randomUUID()}::uuid,
        'integration-test',
        'Verify zero-current withdrawal behavior',
        ${randomUUID()}::uuid,
        'development'::publication_environment,
        ${hash()}::char(64)
      ) as publication_id
    `);
    expect(withdrawal.rows).toEqual([{publication_id: publicationB}]);

    const finalState = await database.execute(sql`
      select
        (select count(*)::integer from atlas_publications where state = 'published') as current_count,
        (select status::text from score_runs where id = ${fixture.baselineRunId}::uuid) as baseline_status,
        (select status::text from food_score_runs where id = ${foodA.runId}::uuid) as food_a_status,
        (select status::text from food_score_runs where id = ${foodB.runId}::uuid) as food_b_status,
        (select status::text from food_score_runs where id = ${foodC.runId}::uuid) as food_c_status,
        (select status::text from score_runs where id = ${fixture.source.sourceBaselineRunId}::uuid) as source_baseline_status,
        (select output_hash from score_runs where id = ${fixture.source.sourceBaselineRunId}::uuid) as source_baseline_hash,
        (select status::text from food_score_runs where id = ${fixture.source.sourceFoodRunId}::uuid) as source_food_status,
        (select output_hash from food_score_runs where id = ${fixture.source.sourceFoodRunId}::uuid) as source_food_hash
    `);
    expect(finalState.rows).toEqual([
      {
        current_count: 0,
        baseline_status: "superseded",
        food_a_status: "superseded",
        food_b_status: "superseded",
        food_c_status: "validated",
        source_baseline_status: "validated",
        source_baseline_hash: fixture.source.sourceBaselineOutputHash,
        source_food_status: "validated",
        source_food_hash: fixture.source.sourceFoodOutputHash,
      },
    ]);
  });
});
