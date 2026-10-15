import { NextResponse } from "next/server";
import { requireSession } from "@/lib/permissions";
import { loadListConfig } from "@/lib/lists";

// Ticket types, modules and priority names/colours, for every signed-in user.
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  return NextResponse.json(await loadListConfig());
}
