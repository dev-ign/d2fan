import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { StudioRequest } from "../../../supabase/shared/studio";
import { artist, releases } from "../../data/content";

const url = import.meta.env.VITE_STUDIO_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_STUDIO_SUPABASE_PUBLISHABLE_KEY;

export interface OwnerLink {
  type: "invite" | "recovery";
  hash: string;
}

export function readOwnerLink(): OwnerLink | undefined {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const invite = fragment.get("owner_invite");
  const recovery = fragment.get("owner_recovery");
  const hash = invite ?? recovery;
  if (
    !hash ||
    (invite !== null && recovery !== null) ||
    !/^[\w-]{20,256}$/.test(hash)
  )
    return;
  return { type: invite ? "invite" : "recovery", hash };
}

export const featuredRelease =
  releases.find(({ id }) => id === artist.featuredReleaseId) ?? releases[0];
export const defaultCampaign =
  featuredRelease.campaignId ?? featuredRelease.slug;

export const studioClient =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          storage: window.sessionStorage,
          storageKey: "jona:studio-session",
          detectSessionInUrl: false,
        },
      })
    : undefined;

export function useStudioRequest<T>(
  accessToken: string,
  request: StudioRequest,
) {
  const payload = JSON.stringify(request);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    token: string;
    payload: string;
    attempt: number;
    data?: T;
    error?: string;
  }>();

  useEffect(() => {
    if (!studioClient) return;
    const controller = new AbortController();
    const key = { token: accessToken, payload, attempt };
    void (async () => {
      try {
        const result = await fetch(
          `${url.replace(/\/$/, "")}/functions/v1/artist-studio`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: publishableKey,
              Authorization: `Bearer ${accessToken}`,
            },
            body: payload,
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10_000),
            ]),
          },
        );
        const data = await result.json();
        if (!controller.signal.aborted) {
          setResponse(
            result.ok
              ? { ...key, data }
              : {
                  ...key,
                  error:
                    typeof data.code === "string" ? data.code : "unavailable",
                },
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setResponse({ ...key, error: "unavailable" });
      }
    })();
    return () => controller.abort();
  }, [accessToken, payload, attempt]);

  const current =
    response?.token === accessToken &&
    response.payload === payload &&
    response.attempt === attempt
      ? response
      : undefined;
  return {
    data: current?.data,
    error: current?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
