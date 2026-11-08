CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_select_own ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY user_profiles_insert_own ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY user_profiles_update_own ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  context text NOT NULL DEFAULT '',
  decision_text text NOT NULL DEFAULT '',
  rationale text NOT NULL DEFAULT '',
  owner_name text NOT NULL CHECK (length(btrim(owner_name)) > 0),
  decision_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'decided', 'superseded')),
  creation_method text NOT NULL DEFAULT 'manual' CHECK (creation_method IN ('manual', 'ai_assisted')),
  source_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decisions_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT decisions_source_notes_length CHECK (source_notes IS NULL OR char_length(source_notes) <= 10000),
  CONSTRAINT decisions_ai_source_required CHECK (creation_method <> 'ai_assisted' OR nullif(btrim(source_notes), '') IS NOT NULL),
  CONSTRAINT decisions_final_status_text_required CHECK (status = 'proposed' OR nullif(btrim(decision_text), '') IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY decisions_owner_all ON public.decisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX decisions_user_date_idx ON public.decisions(user_id, decision_date DESC);
CREATE INDEX decisions_user_status_idx ON public.decisions(user_id, status);
CREATE INDEX decisions_user_owner_idx ON public.decisions(user_id, owner_name);

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_id_user_unique UNIQUE (id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_owner_all ON public.tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX tags_user_name_unique_idx ON public.tags(user_id, lower(btrim(name)));

CREATE TABLE public.decision_tags (
  decision_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, tag_id),
  FOREIGN KEY (decision_id, user_id) REFERENCES public.decisions(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id, user_id) REFERENCES public.tags(id, user_id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_tags TO authenticated;
GRANT ALL ON public.decision_tags TO service_role;
ALTER TABLE public.decision_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_tags_owner_all ON public.decision_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX decision_tags_user_tag_idx ON public.decision_tags(user_id, tag_id);

CREATE TABLE public.decision_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  label text,
  url text NOT NULL CHECK (url ~* '^https?://[^[:space:]]+'),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (decision_id, user_id) REFERENCES public.decisions(id, user_id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_links TO authenticated;
GRANT ALL ON public.decision_links TO service_role;
ALTER TABLE public.decision_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_links_owner_all ON public.decision_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX decision_links_decision_idx ON public.decision_links(decision_id, display_order);

CREATE OR REPLACE FUNCTION public.create_user_profile_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Pengguna'
    )
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER create_user_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_profile_from_auth();

CREATE OR REPLACE FUNCTION public.save_decision_bundle(
  p_decision_id uuid,
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
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_decision_id uuid;
  v_link jsonb;
  v_order integer := 0;
  v_url text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Judul wajib diisi'; END IF;
  IF nullif(btrim(p_owner_name), '') IS NULL THEN RAISE EXCEPTION 'Penanggung jawab wajib diisi'; END IF;
  IF p_status NOT IN ('proposed', 'decided', 'superseded') THEN RAISE EXCEPTION 'Status tidak valid'; END IF;
  IF p_creation_method NOT IN ('manual', 'ai_assisted') THEN RAISE EXCEPTION 'Metode pembuatan tidak valid'; END IF;
  IF p_source_notes IS NOT NULL AND char_length(p_source_notes) > 10000 THEN RAISE EXCEPTION 'Catatan sumber melebihi 10.000 karakter'; END IF;
  IF p_creation_method = 'ai_assisted' AND nullif(btrim(p_source_notes), '') IS NULL THEN RAISE EXCEPTION 'Catatan sumber wajib untuk draft AI'; END IF;
  IF p_status <> 'proposed' AND nullif(btrim(p_decision_text), '') IS NULL THEN RAISE EXCEPTION 'Isi keputusan wajib untuk status ini'; END IF;
  IF p_links IS NOT NULL AND jsonb_typeof(p_links) <> 'array' THEN RAISE EXCEPTION 'Format tautan tidak valid'; END IF;

  IF p_decision_id IS NULL THEN
    INSERT INTO public.decisions (user_id, title, context, decision_text, rationale, owner_name, decision_date, status, creation_method, source_notes)
    VALUES (v_user_id, btrim(p_title), COALESCE(p_context, ''), COALESCE(p_decision_text, ''), COALESCE(p_rationale, ''), btrim(p_owner_name), COALESCE(p_decision_date, CURRENT_DATE), p_status, p_creation_method, p_source_notes)
    RETURNING id INTO v_decision_id;
  ELSE
    UPDATE public.decisions
    SET title = btrim(p_title), context = COALESCE(p_context, ''), decision_text = COALESCE(p_decision_text, ''), rationale = COALESCE(p_rationale, ''), owner_name = btrim(p_owner_name), decision_date = COALESCE(p_decision_date, CURRENT_DATE), status = p_status, creation_method = p_creation_method, source_notes = p_source_notes, updated_at = now()
    WHERE id = p_decision_id AND user_id = v_user_id
    RETURNING id INTO v_decision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Keputusan tidak ditemukan'; END IF;
  END IF;

  INSERT INTO public.tags (user_id, name)
  SELECT v_user_id, cleaned.name
  FROM (SELECT DISTINCT nullif(btrim(tag_name), '') AS name FROM unnest(COALESCE(p_tag_names, ARRAY[]::text[])) AS tag_name) AS cleaned
  WHERE cleaned.name IS NOT NULL
  ON CONFLICT DO NOTHING;

  DELETE FROM public.decision_tags WHERE decision_id = v_decision_id AND user_id = v_user_id;
  INSERT INTO public.decision_tags (decision_id, tag_id, user_id)
  SELECT v_decision_id, t.id, v_user_id
  FROM public.tags t
  WHERE t.user_id = v_user_id
    AND lower(btrim(t.name)) IN (
      SELECT lower(btrim(tag_name)) FROM unnest(COALESCE(p_tag_names, ARRAY[]::text[])) AS tag_name
      WHERE nullif(btrim(tag_name), '') IS NOT NULL
    )
  ON CONFLICT DO NOTHING;

  DELETE FROM public.decision_links WHERE decision_id = v_decision_id AND user_id = v_user_id;
  FOR v_link IN SELECT value FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) AS value LOOP
    v_url := btrim(v_link ->> 'url');
    IF v_url !~* '^https?://[^[:space:]]+' THEN RAISE EXCEPTION 'Tautan harus menggunakan HTTP atau HTTPS'; END IF;
    INSERT INTO public.decision_links (decision_id, user_id, label, url, display_order)
    VALUES (v_decision_id, v_user_id, nullif(btrim(v_link ->> 'label'), ''), v_url, v_order);
    v_order := v_order + 1;
  END LOOP;

  RETURN v_decision_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_decision_bundle(uuid, text, text, text, text, text, date, text, text, text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_decision_bundle(uuid, text, text, text, text, text, date, text, text, text, text[], jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_profiles_touch_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER decisions_touch_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();