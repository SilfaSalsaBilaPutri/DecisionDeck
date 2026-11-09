CREATE OR REPLACE FUNCTION public.create_decision_bundle(
  p_title text,
  p_context text,
  p_decision_text text,
  p_rationale text,
  p_owner_name text,
  p_decision_date date,
  p_status text,
  p_creation_method text,
  p_source_notes text,
  p_tag_names text[],
  p_links jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.save_decision_bundle(
    NULL::uuid,
    p_title,
    p_context,
    p_decision_text,
    p_rationale,
    p_owner_name,
    p_decision_date,
    p_status,
    p_creation_method,
    p_source_notes,
    p_tag_names,
    p_links
  );
$$;
REVOKE ALL ON FUNCTION public.create_decision_bundle(text, text, text, text, text, date, text, text, text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_decision_bundle(text, text, text, text, text, date, text, text, text, text[], jsonb) TO authenticated, service_role;