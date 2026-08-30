"use client";

import type {AtlasTractProfileResponse} from "@mke/contracts";
import {useEffect, useState} from "react";

type TractProfileLoadState = {
  isLoading: boolean;
  response: AtlasTractProfileResponse | null;
};

const idleState: TractProfileLoadState = {isLoading: false, response: null};

type StoredProfileState = {
  key: string;
  response: AtlasTractProfileResponse;
};

export function useTractProfile(
  geoid: string | null,
  expectedRunId: string | null,
): TractProfileLoadState {
  const [stored, setStored] = useState<StoredProfileState | null>(null);
  const requestKey = geoid && expectedRunId ? `${expectedRunId}:${geoid}` : null;

  useEffect(() => {
    if (!geoid || !expectedRunId || !requestKey) {
      return;
    }

    const controller = new AbortController();

    void fetch(`/api/atlas/tracts/${encodeURIComponent(geoid)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => response.json() as Promise<AtlasTractProfileResponse>)
      .then((response) => {
        if (
          response.state === "available"
          && (response.profile.runId !== expectedRunId || response.profile.tract.geoid !== geoid)
        ) {
          setStored({
            key: requestKey,
            response: {state: "unavailable", reason: "profile_incomplete"},
          });
          return;
        }
        setStored({key: requestKey, response});
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStored({
          key: requestKey,
          response: {state: "unavailable", reason: "profile_incomplete"},
        });
      });

    return () => controller.abort();
  }, [expectedRunId, geoid, requestKey]);

  if (!requestKey) {
    return idleState;
  }
  if (stored?.key !== requestKey) {
    return {isLoading: true, response: null};
  }
  return {isLoading: false, response: stored.response};
}
