-- David credit-negotiation per-order serialization RPCs.
-- SQL artifact only: do not treat this file as evidence that the migration was applied.

CREATE OR REPLACE FUNCTION public.recoup_reserve_credit_negotiation_send(p_send jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action_id text := p_send ->> 'action_id';
  v_idempotency_key text := p_send ->> 'idempotency_key';
  v_order_id text := p_send ->> 'order_id';
  v_round_no integer := (p_send ->> 'round_no')::integer;
  v_send public.credit_negotiation_sends%ROWTYPE;
BEGIN
  IF v_order_id IS NULL OR pg_catalog.btrim(v_order_id) = '' THEN
    RAISE EXCEPTION 'credit_negotiation_send_order_id_required';
  END IF;

  IF v_action_id IS NULL OR pg_catalog.btrim(v_action_id) = '' THEN
    RAISE EXCEPTION 'credit_negotiation_send_action_id_required';
  END IF;

  IF v_idempotency_key IS NULL OR pg_catalog.btrim(v_idempotency_key) = '' THEN
    RAISE EXCEPTION 'credit_negotiation_send_idempotency_key_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order_id, 0));

  IF EXISTS (
    SELECT 1
    FROM public.credit_negotiation_rounds AS negotiation_round
    WHERE negotiation_round.order_id = v_order_id
      AND negotiation_round.status = 'human_review'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked_human_review');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.credit_negotiation_inbound_emails AS inbound_email
    JOIN public.credit_negotiation_rounds AS negotiation_round
      ON negotiation_round.round_id = inbound_email.round_id
      AND negotiation_round.order_id = inbound_email.order_id
    WHERE inbound_email.order_id = v_order_id
      AND negotiation_round.status IN ('drafted', 'sent', 'human_review')
  ) OR EXISTS (
    SELECT 1
    FROM public.credit_counter_offers AS counter_offer
    JOIN public.credit_negotiation_rounds AS negotiation_round
      ON negotiation_round.round_id = counter_offer.round_id
      AND negotiation_round.order_id = counter_offer.order_id
    WHERE counter_offer.order_id = v_order_id
      AND counter_offer.source = 'email'
      AND counter_offer.status = 'human_review'
      AND negotiation_round.status IN ('drafted', 'sent', 'human_review')
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked_human_review');
  END IF;

  SELECT negotiation_send.*
  INTO v_send
  FROM public.credit_negotiation_sends AS negotiation_send
  WHERE negotiation_send.order_id = v_order_id
    AND (
      negotiation_send.action_id = v_action_id
      OR negotiation_send.idempotency_key = v_idempotency_key
    )
  ORDER BY CASE WHEN negotiation_send.action_id = v_action_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'existing', 'send', pg_catalog.to_jsonb(v_send));
  END IF;

  INSERT INTO public.credit_negotiation_rounds (
    round_id,
    order_id,
    account_id,
    round_no,
    status
  )
  VALUES (
    v_action_id,
    v_order_id,
    p_send ->> 'account_id',
    v_round_no,
    'drafted'
  )
  ON CONFLICT (round_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.credit_negotiation_rounds AS negotiation_round
    WHERE negotiation_round.round_id = v_action_id
      AND negotiation_round.order_id = v_order_id
      AND negotiation_round.account_id = p_send ->> 'account_id'
      AND negotiation_round.round_no = v_round_no
  ) THEN
    RAISE EXCEPTION 'credit_negotiation_send_round_conflict';
  END IF;

  INSERT INTO public.credit_negotiation_sends (
    round_id,
    action_id,
    account_id,
    order_id,
    round_no,
    approved_body_hash,
    idempotency_key,
    from_email,
    reply_to_email,
    to_email,
    subject,
    principal,
    status,
    reserved_at
  )
  VALUES (
    v_action_id,
    v_action_id,
    p_send ->> 'account_id',
    v_order_id,
    v_round_no,
    p_send ->> 'approved_body_hash',
    v_idempotency_key,
    p_send ->> 'from_email',
    p_send ->> 'reply_to_email',
    p_send ->> 'to_email',
    p_send ->> 'subject',
    p_send ->> 'principal',
    'pending',
    (p_send ->> 'reserved_at')::timestamptz
  )
  RETURNING * INTO v_send;

  RETURN pg_catalog.jsonb_build_object('status', 'reserved', 'send', pg_catalog.to_jsonb(v_send));
END;
$$;

CREATE OR REPLACE FUNCTION public.recoup_insert_credit_negotiation_inbound(p_inbound jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inbound public.credit_negotiation_inbound_emails%ROWTYPE;
  v_order_id text := p_inbound ->> 'order_id';
BEGIN
  IF v_order_id IS NULL OR pg_catalog.btrim(v_order_id) = '' THEN
    RAISE EXCEPTION 'credit_negotiation_inbound_order_id_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order_id, 0));

  INSERT INTO public.credit_negotiation_inbound_emails (
    round_id,
    account_id,
    order_id,
    round_no,
    email_id,
    message_id,
    from_email,
    to_email,
    subject,
    source,
    raw_body_hash,
    text_body_hash,
    body_fetch_status
  )
  VALUES (
    p_inbound ->> 'round_id',
    p_inbound ->> 'account_id',
    v_order_id,
    (p_inbound ->> 'round_no')::integer,
    p_inbound ->> 'email_id',
    p_inbound ->> 'message_id',
    p_inbound ->> 'from_email',
    p_inbound ->> 'to_email',
    p_inbound ->> 'subject',
    p_inbound ->> 'source',
    p_inbound ->> 'raw_body_hash',
    p_inbound ->> 'text_body_hash',
    p_inbound ->> 'body_fetch_status'
  )
  ON CONFLICT (email_id) DO UPDATE SET email_id = EXCLUDED.email_id
  RETURNING * INTO v_inbound;

  RETURN pg_catalog.to_jsonb(v_inbound);
END;
$$;

CREATE OR REPLACE FUNCTION public.recoup_insert_credit_counter_offer(p_counter jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_counter public.credit_counter_offers%ROWTYPE;
  v_order_id text := p_counter ->> 'order_id';
BEGIN
  IF v_order_id IS NULL OR pg_catalog.btrim(v_order_id) = '' THEN
    RAISE EXCEPTION 'credit_counter_offer_order_id_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order_id, 0));

  INSERT INTO public.credit_counter_offers (
    round_id,
    account_id,
    order_id,
    source,
    email_id,
    message_id,
    cited_spans_json,
    extracted_terms_json,
    parse_reason,
    status
  )
  VALUES (
    p_counter ->> 'round_id',
    p_counter ->> 'account_id',
    v_order_id,
    p_counter ->> 'source',
    p_counter ->> 'email_id',
    p_counter ->> 'message_id',
    p_counter -> 'cited_spans_json',
    p_counter -> 'extracted_terms_json',
    p_counter ->> 'parse_reason',
    p_counter ->> 'status'
  )
  ON CONFLICT (email_id) DO UPDATE SET email_id = EXCLUDED.email_id
  RETURNING * INTO v_counter;

  RETURN pg_catalog.to_jsonb(v_counter);
END;
$$;

REVOKE ALL ON FUNCTION public.recoup_reserve_credit_negotiation_send(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recoup_insert_credit_negotiation_inbound(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recoup_insert_credit_counter_offer(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recoup_reserve_credit_negotiation_send(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.recoup_insert_credit_negotiation_inbound(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.recoup_insert_credit_counter_offer(jsonb) TO service_role;
