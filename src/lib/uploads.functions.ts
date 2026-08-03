import { createServerFn } from "@tanstack/react-start";

/** Returns the public HTTPS base used to serve uploaded media to the Meta API. */
export const getUploadBaseUrl = createServerFn({ method: "GET" }).handler(async () => {
  const base = process.env["APP_BASE_URL"] ?? null;
  return { baseUrl: base ? base.replace(/\/+$/, "") : null };
});
