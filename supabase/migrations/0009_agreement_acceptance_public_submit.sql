-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0009 · Public agreement acceptance submit path
--
-- D-07/D-14: public signers may accept or decline only through a tightly scoped
-- SECURITY DEFINER RPC that validates a public_endpoints token hash and updates
-- one target agreement_acceptances row. This migration does not add anon table
-- grants or broad anon INSERT/UPDATE policies on agreement tables.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create or replace function public.submit_agreement_acceptance(
  p_token_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_endpoint public.public_endpoints%rowtype;
  v_acceptance public.agreement_acceptances%rowtype;
  v_now timestamptz := now();
  v_action text;
  v_signer_name text;
  v_payload_agreement_id text;
  v_signature_ref text;
begin
  if nullif(btrim(coalesce(p_token_hash, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ENDPOINT');
  end if;

  select *
    into v_endpoint
    from public.public_endpoints
   where token_hash = p_token_hash
     and kind = 'AGREEMENT_ACCEPTANCE'
     and status = 'ACTIVE'
     and (expires_at is null or expires_at > v_now)
     and scopes ? 'agreement_acceptance:sign'
     and target_id is not null
     and consent_agreement_id is not null
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ENDPOINT');
  end if;

  select *
    into v_acceptance
    from public.agreement_acceptances
   where id = v_endpoint.target_id
     and org_id = v_endpoint.org_id
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND');
  end if;

  if v_acceptance.template_id <> v_endpoint.consent_agreement_id then
    return jsonb_build_object('ok', false, 'code', 'CONSENT_MISMATCH');
  end if;

  v_payload_agreement_id := nullif(btrim(coalesce(p_payload #>> '{consent,agreementId}', '')), '');
  if v_payload_agreement_id is not null and v_payload_agreement_id <> v_endpoint.consent_agreement_id then
    return jsonb_build_object('ok', false, 'code', 'CONSENT_MISMATCH');
  end if;

  if lower(coalesce(p_payload #>> '{consent,confirmed}', 'false')) <> 'true' then
    return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED');
  end if;

  if nullif(btrim(coalesce(p_payload #>> '{target,acceptanceId}', '')), v_acceptance.id) is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_MISMATCH');
  end if;
  if nullif(btrim(coalesce(p_payload #>> '{target,templateId}', '')), v_acceptance.template_id) is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_MISMATCH');
  end if;
  if nullif(btrim(coalesce(p_payload #>> '{target,studentId}', '')), coalesce(v_acceptance.student_id, '')) is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_MISMATCH');
  end if;
  if nullif(btrim(coalesce(p_payload #>> '{target,familyId}', '')), coalesce(v_acceptance.family_id, '')) is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_MISMATCH');
  end if;
  if nullif(btrim(coalesce(p_payload #>> '{target,enrollmentId}', '')), coalesce(v_acceptance.enrollment_id, '')) is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_MISMATCH');
  end if;
  if nullif(btrim(coalesce(p_payload #>> '{target,guardianId}', '')), coalesce(v_acceptance.guardian_id, '')) is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_MISMATCH');
  end if;

  if v_acceptance.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED');
  end if;

  v_action := upper(nullif(btrim(coalesce(p_payload->>'action', '')), ''));
  if v_action is null or v_action not in ('ACCEPT', 'DECLINE') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTION');
  end if;

  v_signer_name := nullif(btrim(coalesce(p_payload #>> '{signer,fullName}', '')), '');
  if v_signer_name is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_SIGNER');
  end if;

  if v_action = 'ACCEPT' then
    if lower(coalesce(p_payload #>> '{consent,accepted}', 'false')) <> 'true' then
      return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED');
    end if;
    v_signature_ref := 'typed://agreement_acceptances/' || v_acceptance.id || '/' ||
      encode(digest(v_signer_name || ':' || v_acceptance.id || ':' || (to_jsonb(v_now)#>>'{}') || ':' || p_token_hash, 'sha256'), 'hex');
  else
    v_signature_ref := 'declined://agreement_acceptances/' || v_acceptance.id || '/' ||
      encode(digest(v_signer_name || ':' || v_acceptance.id || ':' || (to_jsonb(v_now)#>>'{}') || ':' || p_token_hash, 'sha256'), 'hex');
  end if;

  update public.agreement_acceptances
     set status = case when v_action = 'ACCEPT' then 'ACCEPTED' else 'DECLINED' end,
         accepted_at = case when v_action = 'ACCEPT' then v_now else null end,
         accepted_by_name = v_signer_name,
         signature_ref = v_signature_ref,
         updated_at = v_now,
         updated_by = 'public-agreement-submit'
   where id = v_acceptance.id
     and org_id = v_acceptance.org_id;

  update public.public_endpoints
     set status = 'EXPIRED',
         last_used_at = v_now,
         updated_at = v_now,
         updated_by = 'public-agreement-submit'
   where id = v_endpoint.id;

  return jsonb_build_object(
    'ok', true,
    'acceptanceId', v_acceptance.id,
    'status', case when v_action = 'ACCEPT' then 'ACCEPTED' else 'DECLINED' end,
    'submittedAt', to_jsonb(v_now)#>>'{}'
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'code', 'SUBMIT_FAILED');
end;
$$;

revoke all on function public.submit_agreement_acceptance(text, jsonb) from public;
grant execute on function public.submit_agreement_acceptance(text, jsonb) to anon;
grant execute on function public.submit_agreement_acceptance(text, jsonb) to authenticated;

comment on function public.submit_agreement_acceptance(text, jsonb) is
  'D-07/D-14 controlled public agreement signing path. Validates public_endpoints, explicit consent/setup, target lineage, expiry, and updates only the target agreement_acceptances row.';
