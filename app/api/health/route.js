export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    hasHubSpotToken: Boolean(process.env.HUBSPOT_TOKEN),
    adminKeyEnabled: Boolean(process.env.ADMIN_SYNC_KEY),
  });
}
