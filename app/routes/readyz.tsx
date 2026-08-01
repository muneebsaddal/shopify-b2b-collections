import prisma from "../db.server";

export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ready", release: process.env.RELEASE_VERSION || "development" });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503 });
  }
};
