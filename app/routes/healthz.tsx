export const loader = () =>
  Response.json({ status: "ok", release: process.env.RELEASE_VERSION || "development" });
