import { requireAdmin } from "@/lib/admin-guard";
import { clampLimit, cleanSearch, dbFail, fail, ok, readJson } from "@/lib/admin-api";
import { getSupabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";
import { parsePart } from "@/lib/admin-parts";

export const dynamic = "force-dynamic";

const FIELDS = "id, name, brand, model, years, oem_number, alt_grade, price, stock, branch, image_url, is_active, created_at";
const MAIN_BRANCH = "إدلب - سرمدا";

/** ?q=  ?branch=  ?active=1|0  ?low=1 (stock <= 5) */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = cleanSearch(url.searchParams.get("q"));
  const branch = url.searchParams.get("branch");
  const active = url.searchParams.get("active");

  let query = getSupabaseAdmin().from("parts").select(FIELDS);
  if (q) query = query.or(`name.ilike.*${q}*,brand.ilike.*${q}*,oem_number.ilike.*${q}*,model.ilike.*${q}*`);
  if (branch) query = query.eq("branch", branch);
  if (active === "1") query = query.eq("is_active", true);
  if (active === "0") query = query.eq("is_active", false);
  if (url.searchParams.get("low") === "1") query = query.lte("stock", 5);

  const { data, error } = await query
    .order("name", { ascending: true })
    .limit(clampLimit(url.searchParams.get("limit"), 500, 1000));

  if (error) return dbFail("parts list", error, "تعذر تحميل القطع");

  return ok({ parts: data ?? [], branches: [MAIN_BRANCH] });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson(req);
  if (!body) return fail("بيانات غير صالحة");

  const parsed = parsePart({ ...body, branch: MAIN_BRANCH }, false);
  if (!parsed.ok) return fail(parsed.error);

  // parts.id is text without a default: generate a short URL-safe id (it must match the cart's id pattern).
  const id = `P${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

  const { data, error } = await getSupabaseAdmin()
    .from("parts")
    .insert({
      model: "",
      years: "",
      alt_grade: null,
      image_url: null,
      is_active: true,
      ...parsed.value,
      branch: MAIN_BRANCH,
      id,
    })
    .select(FIELDS)
    .single();

  if (error) return dbFail("parts insert", error, "تعذر إضافة القطعة");

  return ok({ part: data }, 201);
}