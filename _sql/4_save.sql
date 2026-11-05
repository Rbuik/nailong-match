CREATE OR REPLACE FUNCTION public.nl_save(p_token text, p_slot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  SELECT s.account_id INTO v_id FROM public.nl_sessions s WHERE s.token = coalesce(p_token, '');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', '登录已过期，请重新登录');
  END IF;
  IF p_slot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', '没有要保存的存档');
  END IF;
  UPDATE public.nl_accounts SET slot = p_slot, updated_at = now() WHERE id = v_id;
  UPDATE public.nl_sessions SET last_at = now() WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END;
$fn$
