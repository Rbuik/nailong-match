CREATE OR REPLACE FUNCTION public.nl_login(p_nick text, p_pass text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_key text := lower(btrim(coalesce(p_nick, '')));
  v_row public.nl_accounts%ROWTYPE;
  v_token text;
BEGIN
  IF v_key = '' OR coalesce(p_pass, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', '名字或密码不正确，请确认后再次输入');
  END IF;
  SELECT * INTO v_row FROM public.nl_accounts a WHERE a.nick_key = v_key;
  IF NOT FOUND OR v_row.pass <> crypt(p_pass, v_row.pass) THEN
    RETURN jsonb_build_object('ok', false, 'reason', '名字或密码不正确，请确认后再次输入');
  END IF;
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.nl_sessions (token, account_id) VALUES (v_token, v_row.id);
  UPDATE public.nl_accounts SET updated_at = now() WHERE id = v_row.id;
  RETURN jsonb_build_object('ok', true, 'token', v_token, 'nick', v_row.nick, 'uid', v_row.uid, 'slot', v_row.slot);
END;
$fn$
