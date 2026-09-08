import { requireUser, AuthError } from "@/lib/auth/session";
import { apiError } from "@/lib/api/route-helpers";

/**
 * Direct file uploads need a blob provider (BLOB_READ_WRITE_TOKEN).
 * Until wired: proof via links/URLs. This endpoint says so plainly (503)
 * instead of pretending uploads work.
 */
export async function POST() {
  try {
    await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return apiError("UPLOAD_UNCONFIGURED", "Direct uploads aren't wired on this server — attach proof via link instead.", 503);
  return apiError("UPLOAD_UNCONFIGURED", "Blob provider support lands with the storage integration.", 503);
}
