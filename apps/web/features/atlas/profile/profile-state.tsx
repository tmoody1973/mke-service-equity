import type {AtlasTractProfileResponse, AtlasTractProperties} from "@mke/contracts";
import {EmptyState} from "@heroui-pro/react";
import {Skeleton} from "@heroui/react";
import {TractSummary} from "../tract-summary";
import {TractProfileContent} from "./profile-content";

type TractProfileStateProps = {
  idPrefix: string;
  isLoading: boolean;
  response: AtlasTractProfileResponse | null;
  tract: AtlasTractProperties;
};

export function TractProfileState({idPrefix, isLoading, response, tract}: TractProfileStateProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" role="status">
        <TractSummary idPrefix={`${idPrefix}-loading`} tract={tract} />
        <p className="text-sm">Loading the detailed explanation…</p>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (response?.state === "available") {
    return <TractProfileContent idPrefix={idPrefix} profile={response.profile} />;
  }

  if (response?.state === "unavailable") {
    return (
      <div className="space-y-4">
        <TractSummary idPrefix={`${idPrefix}-unavailable`} tract={tract} />
        <EmptyState className="border border-dashed border-divider">
          <EmptyState.Title>Detailed explanation unavailable</EmptyState.Title>
          <EmptyState.Description>
            The summary is still available. The supporting measures could not be loaded safely. Please try again later.
          </EmptyState.Description>
        </EmptyState>
      </div>
    );
  }

  return <TractSummary idPrefix={`${idPrefix}-summary`} tract={tract} />;
}
