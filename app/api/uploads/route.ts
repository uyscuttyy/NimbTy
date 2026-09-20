import { requireUser, AuthError } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { put } from "@vercel/blob";

/**
 * Direct file uploads to Vercel Blob.
 * Requires BLOB_READ_WRITE_TOKEN in environment (auto-set on Vercel when Blob store attached).
 * Returns { url, pathname, contentType, size } on success.
 */
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return apiError(
      "UPLOAD_UNCONFIGURED",
      "Direct uploads aren't wired on this server — attach proof via link instead.",
      503
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return apiError("INVALID_BODY", "No file provided.", 400);

  // Guard: max 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return apiError("FILE_TOO_LARGE", "File must be ≤ 10 MB.", 400);
  }

  try {
    const blob = await put(file.name, file, {
      access: "public",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return apiOk({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (err) {
    console.error("upload failed", err);
    return apiError("UPLOAD_FAILED", "Could not upload file.", 500);
  }
}
