import { supabase } from "../lib/supabaseClient";

const POST_FIELDS = "id,title,content,slug,excerpt,tags,created_at";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase 클라이언트가 초기화되지 않았습니다. 환경 변수를 확인하세요.");
  }
  return supabase;
}

export async function fetchBlogPosts({ limit = 50 } = {}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("posts")
    .select(POST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function fetchBlogPostBySlug(slug) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("posts")
    .select(POST_FIELDS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

