import { requireUserId, supabase } from "../lib/supabaseClient";

export async function loadRemoteSettings() {
  if (!supabase) return null;
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    knowledgeBase: data.knowledge_base && typeof data.knowledge_base === "object" ? data.knowledge_base : {},
    categories: Array.isArray(data.categories) ? data.categories : [],
    categoryColors: data.category_colors && typeof data.category_colors === "object" ? data.category_colors : {},
    autoRules:
      data.auto_rules && typeof data.auto_rules === "object"
        ? data.auto_rules
        : { keywordRules: [], transferRules: [] },
    visibleColumns: data.visible_columns && typeof data.visible_columns === "object" ? data.visible_columns : {}
  };
}

export async function saveRemoteSettings(settings) {
  const userId = await requireUserId();
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    knowledge_base: settings.knowledgeBase || {},
    categories: settings.categories || [],
    category_colors: settings.categoryColors || {},
    auto_rules: settings.autoRules || { keywordRules: [], transferRules: [] },
    visible_columns: settings.visibleColumns || {},
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}
