"use client";

import {CheckboxButtonGroup} from "@heroui-pro/react";
import {
  Button,
  Checkbox,
  Description,
  FieldError,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import type {FormEvent} from "react";

import {explainPriorityLevel} from "../atlas/tract-summary";
import {
  OPPORTUNITY_BANDS,
  OPPORTUNITY_PRIORITIES,
  type NumericFilterKey,
  type OpportunityFilterDraft,
  type OpportunityFilterErrors,
} from "./opportunity-filter-state";

type NumericFieldDefinition = {
  description: string;
  key: NumericFilterKey;
  label: string;
  maximum: number | undefined;
  placeholder: string;
};

const NUMERIC_FIELDS: Array<NumericFieldDefinition> = [
  {
    key: "equityPercentileMinimum",
    label: "Equity Baseline county percentile",
    description: "At least this percentile, including the number you enter. Use 0 through 100.",
    maximum: 100,
    placeholder: "No minimum",
  },
  {
    key: "foodNeedPercentileMinimum",
    label: "Food Access Need county percentile",
    description: "At least this percentile, including the number you enter. Use 0 through 100.",
    maximum: 100,
    placeholder: "No minimum",
  },
  {
    key: "noVehicleMinimumPercent",
    label: "Households with no vehicle available",
    description: "At least this percentage, including the number you enter. Use 0 through 100.",
    maximum: 100,
    placeholder: "No minimum",
  },
  {
    key: "snapLowAccessMinimumPercent",
    label: "Residents beyond one driving mile from a SNAP-authorized retailer",
    description: "At least this percentage, including the number you enter. Use 0 through 100.",
    maximum: 100,
    placeholder: "No minimum",
  },
  {
    key: "groceryWalkMinimumMinutes",
    label: "Walk to the nearest full-service grocery",
    description: "At least this many walking minutes, including the number you enter.",
    maximum: undefined,
    placeholder: "No minimum",
  },
  {
    key: "transitMaximumTripsPerHour",
    label: "Scheduled transit within a ten-minute walk",
    description: "At most this many scheduled trips per hour, including the number you enter.",
    maximum: undefined,
    placeholder: "No maximum",
  },
];

function CategoryGroup({
  description,
  label,
  name,
  onChange,
  options,
  value,
}: {
  description: string;
  label: string;
  name: string;
  onChange: (value: Array<string>) => void;
  options: ReadonlyArray<{description?: string; label: string; value: string}>;
  value: Array<string>;
}) {
  return (
    <CheckboxButtonGroup
      aria-label={label}
      className="grid w-full grid-cols-2 gap-2"
      layout="grid"
      name={name}
      value={value}
      variant="secondary"
      onChange={onChange}
    >
      <Label className="col-span-full font-semibold text-foreground">{label}</Label>
      <Description className="col-span-full">{description}</Description>
      {options.map((option) => (
        <CheckboxButtonGroup.Item
          aria-label={`${label}: ${option.label}`}
          className="min-h-14"
          key={option.value}
          value={option.value}
        >
          <CheckboxButtonGroup.Indicator />
          <CheckboxButtonGroup.ItemContent>
            <Label>{option.label}</Label>
            {option.description ? <Description>{option.description}</Description> : null}
          </CheckboxButtonGroup.ItemContent>
        </CheckboxButtonGroup.Item>
      ))}
    </CheckboxButtonGroup>
  );
}

function NumericFilterField({
  definition,
  error,
  onChange,
  value,
}: {
  definition: NumericFieldDefinition;
  error: string | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputId = `opportunity-filter-${definition.key}`;
  return (
    <TextField
      aria-label={definition.label}
      fullWidth
      isInvalid={Boolean(error)}
      name={definition.key}
      type="number"
      value={value}
      onChange={onChange}
    >
      <label className="label" htmlFor={inputId}>{definition.label}</label>
      <Input
        fullWidth
        id={inputId}
        inputMode="decimal"
        max={definition.maximum}
        min={0}
        placeholder={definition.placeholder}
        step="0.01"
        variant="secondary"
      />
      {error ? <FieldError>{error}</FieldError> : <Description>{definition.description}</Description>}
    </TextField>
  );
}

export function OpportunityFilterForm({
  draft,
  errors,
  onApply,
  onDraftChange,
  onReset,
}: {
  draft: OpportunityFilterDraft;
  errors: OpportunityFilterErrors;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (draft: OpportunityFilterDraft) => void;
  onReset: () => void;
}) {
  const update = <Key extends keyof OpportunityFilterDraft>(
    key: Key,
    value: OpportunityFilterDraft[Key],
  ) => onDraftChange({...draft, [key]: value});

  return (
    <form
      aria-labelledby="opportunity-filters-heading"
      className="space-y-6"
      noValidate
      onSubmit={onApply}
    >
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground" id="opportunity-filters-heading">
          Choose conditions
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Inside one group, an area can match any choice you select. When you use more than one
          group, an area must match every group. Draft changes do not affect results until you
          apply them.
        </p>
      </div>

      {errors.form ? <p className="text-sm text-danger" role="alert">{errors.form}</p> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <CategoryGroup
          description="Choose one or more. An area can match any selected Priority."
          label="Food Equity Priority"
          name="priorities"
          options={OPPORTUNITY_PRIORITIES.map((priority) => ({
            value: String(priority),
            label: `Priority ${priority}`,
            description: explainPriorityLevel(priority),
          }))}
          value={draft.priorities}
          onChange={(value) => update("priorities", value)}
        />
        <CategoryGroup
          description="Choose one or more Equity Baseline bands."
          label="Equity Baseline band"
          name="equity-bands"
          options={OPPORTUNITY_BANDS}
          value={draft.equityBands}
          onChange={(value) => update("equityBands", value)}
        />
        <CategoryGroup
          description="Choose one or more Food Access Need bands."
          label="Food Access Need band"
          name="food-need-bands"
          options={OPPORTUNITY_BANDS}
          value={draft.foodNeedBands}
          onChange={(value) => update("foodNeedBands", value)}
        />
      </div>

      <section aria-labelledby="numeric-conditions-heading" className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground" id="numeric-conditions-heading">
            Number-based conditions
          </h3>
          <p className="text-sm leading-6 text-muted">
            Leave a box blank when you do not want to use that condition. Zero is a real value,
            not a blank or missing value. Numbers may use up to two decimal places.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NUMERIC_FIELDS.map((definition) => (
            <NumericFilterField
              definition={definition}
              error={errors[definition.key]}
              key={definition.key}
              value={draft[definition.key]}
              onChange={(value) => update(definition.key, value)}
            />
          ))}
        </div>
        <Checkbox
          isSelected={draft.includeUnreachableGrocery}
          name="include-unreachable-grocery"
          variant="secondary"
          onChange={(value) => update("includeUnreachableGrocery", value)}
        >
          <Checkbox.Content className="min-h-11">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            No walking route found
          </Checkbox.Content>
          <Description>
            Include only the verified unreachable grocery state. This is different from a long
            walk and is never treated as an unlimited number of minutes.
          </Description>
        </Checkbox>
      </section>

      <div className="flex flex-col gap-3 border-t border-divider pt-5 sm:flex-row">
        <Button className="min-h-11" type="submit" variant="primary">
          Apply filters
        </Button>
        <Button className="min-h-11" type="button" variant="ghost" onPress={onReset}>
          Reset draft to applied filters
        </Button>
      </div>
    </form>
  );
}
