"use client";

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
}

export async function resolveShareOrigin() {
  const current = window.location.origin;
  if (!isLoopback(window.location.hostname)) return current;
  try {
    const response = await fetch("/api/network-origin", { cache: "no-store" });
    const body = (await response.json()) as { origin?: string };
    return response.ok && body.origin ? body.origin : current;
  } catch {
    return current;
  }
}
