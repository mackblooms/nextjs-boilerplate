import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function getFileExtension(file: File): string {
  const explicitExt = file.name.split(".").pop()?.toLowerCase();
  if (explicitExt && /^[a-z0-9]+$/.test(explicitExt)) return explicitExt;

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

async function ensureAvatarBucket() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
  if (listErr) return listErr.message;

  const hasBucket = (buckets ?? []).some(
    (bucket) => bucket.id === AVATAR_BUCKET || bucket.name === AVATAR_BUCKET,
  );
  if (hasBucket) return null;

  const { error: createErr } = await supabaseAdmin.storage.createBucket(
    AVATAR_BUCKET,
    {
      public: true,
      fileSizeLimit: MAX_AVATAR_BYTES,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    },
  );

  if (createErr && !/already exists|duplicate/i.test(createErr.message ?? "")) {
    return createErr.message;
  }

  return null;
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 },
      );
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(
      token,
    );
    if (authErr || !authData.user) {
      return NextResponse.json(
        { error: authErr?.message ?? "Unauthorized." },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const avatar = formData.get("avatar");

    if (!(avatar instanceof File)) {
      return NextResponse.json(
        { error: "Please select an image file." },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(avatar.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json(
        { error: "Supported formats: JPG, PNG, WEBP, GIF." },
        { status: 400 },
      );
    }

    if (avatar.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "Image must be 5MB or smaller." },
        { status: 400 },
      );
    }

    const bucketErr = await ensureAvatarBucket();
    if (bucketErr) {
      return NextResponse.json(
        { error: `Avatar storage setup failed: ${bucketErr}` },
        { status: 500 },
      );
    }

    const extension = getFileExtension(avatar);
    const userId = authData.user.id;
    const objectPath = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${extension}`;

    const fileBuffer = Buffer.from(await avatar.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType: avatar.type,
        upsert: false,
        cacheControl: "31536000",
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: uploadErr.message ?? "Failed to upload avatar." },
        { status: 400 },
      );
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({ ok: true, avatarUrl: publicUrl });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
