import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Supabase will attach tokens to the URL hash.
  // The Supabase JS client will pick them up on the client side after redirect.
  // For now, just send them to a page that can load the session.
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/", url.origin));
}
