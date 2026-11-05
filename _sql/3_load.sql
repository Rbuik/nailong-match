CREATE OR REPLACE FUNCTION public.nl_load(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_row public.nl_accounts%ROWTYPE;
BEGIN
  SELECT a.* INTO v_row
  FROM public.nl_sessions s
  JOIN public.nl_accounts a ON a.id = s.account_id
  WHERE s.token = coalesce(p_token, '');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', '登录已过期，请重新登录');
  END IF;
  UPDATE public.nl_sessions SET last_at = now() WHERE token = p_token;
  RETURN jsonb_build_object('ok', true, 'nick', v_row.nick, 'uid', v_row.uid, 'slot', v_row.slot);
END;
$fn$
