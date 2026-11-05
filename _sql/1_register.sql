CREATE OR REPLACE FUNCTION public.nl_register(p_nick text, p_pass text, p_uid text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_nick text := btrim(coalesce(p_nick, ''));
  v_key text;
  v_uid text := btrim(coalesce(p_uid, ''));
  v_token text;
  v_id bigint;
BEGIN
  IF length(v_nick) < 1 OR length(v_nick) > 12 THEN
    RETURN jsonb_build_object('ok', false, 'reason', '名字要 1~12 个字');
  END IF;
  IF length(coalesce(p_pass, '')) < 4 OR length(p_pass) > 24 THEN
    RETURN jsonb_build_object('ok', false, 'reason', '密码要 4~24 位');
  END IF;
  v_key := lower(v_nick);
  IF EXISTS (SELECT 1 FROM public.nl_accounts a WHERE a.nick_key = v_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', '这个名字已经有人用了');
  END IF;
  IF v_uid = '' THEN
    v_uid := encode(gen_random_bytes(9), 'hex');
  END IF;
  INSERT INTO public.nl_accounts (nick_key, nick, uid, pass)
  VALUES (v_key, v_nick, v_uid, crypt(p_pass, gen_salt('bf', 10)))
  RETURNING id INTO v_id;
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.nl_sessions (token, account_id) VALUES (v_token, v_id);
  RETURN jsonb_build_object('ok', true, 'token', v_token, 'nick', v_nick, 'uid', v_uid, 'slot', NULL);
END;
$fn$
