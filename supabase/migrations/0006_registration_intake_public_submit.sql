-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0006 · Public registration intake submit path
--
-- D-07/D-14: public applicants may submit only through a tightly scoped
-- SECURITY DEFINER RPC that validates a public_endpoints token hash and writes
-- one quarantined registration_intake row. This migration does not add anon
-- table grants or broad anon INSERT policies on org tables.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

alter table public.registration_intake
  add column if not exists applicant_name text,
  add column if not exists applicant_email text,
  add column if not exists applicant_phone text,
  add column if not exists status_history jsonb not null default '[]'::jsonb;

create or replace function public.submit_registration_intake(
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
  v_now timestamptz := now();
  v_id text;
  v_student_name text;
  v_student_date text;
  v_requested_activity_id text;
  v_instrument text;
  v_notes text;
  v_guardians jsonb;
  v_consent_accepted boolean;
  v_payload_consent_agreement_id text;
  v_applicant_name text;
  v_applicant_email text;
  v_applicant_phone text;
begin
  if nullif(btrim(coalesce(p_token_hash, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ENDPOINT');
  end if;

  select *
    into v_endpoint
    from public.public_endpoints
   where token_hash = p_token_hash
     and kind = 'REGISTRATION_INTAKE'
     and status = 'ACTIVE'
     and (expires_at is null or expires_at > v_now)
     and scopes ? 'registration_intake:submit'
     and consent_agreement_id is not null
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ENDPOINT');
  end if;

  v_consent_accepted := lower(coalesce(p_payload #>> '{consent,accepted}', 'false')) = 'true';
  v_payload_consent_agreement_id := nullif(btrim(coalesce(p_payload #>> '{consent,agreementId}', '')), '');
  if not v_consent_accepted then
    return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED');
  end if;
  if v_payload_consent_agreement_id is not null
     and v_payload_consent_agreement_id <> v_endpoint.consent_agreement_id then
    return jsonb_build_object('ok', false, 'code', 'CONSENT_MISMATCH');
  end if;

  v_student_name := nullif(btrim(coalesce(p_payload #>> '{student,fullName}', '')), '');
  if v_student_name is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_STUDENT');
  end if;

  v_guardians := case
    when jsonb_typeof(p_payload->'guardians') = 'array' then p_payload->'guardians'
    else '[]'::jsonb
  end;
  if jsonb_array_length(v_guardians) = 0 or not exists (
    select 1
      from jsonb_array_elements(v_guardians) as guardian(value)
     where nullif(btrim(coalesce(guardian.value->>'fullName', '')), '') is not null
       and (
         nullif(btrim(coalesce(guardian.value->>'email', '')), '') is not null
         or nullif(btrim(coalesce(guardian.value->>'phone', '')), '') is not null
       )
  ) then
    return jsonb_build_object('ok', false, 'code', 'MISSING_CONTACT');
  end if;

  v_id := 'intake_' || replace(gen_random_uuid()::text, '-', '');
  v_student_date := nullif(btrim(coalesce(p_payload #>> '{student,dateOfBirth}', '')), '');
  v_requested_activity_id := coalesce(
    nullif(btrim(coalesce(p_payload #>> '{student,requestedActivityId}', '')), ''),
    v_endpoint.target_id
  );
  v_instrument := nullif(btrim(coalesce(p_payload #>> '{student,instrument}', '')), '');
  v_notes := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_applicant_name := nullif(btrim(coalesce(p_payload #>> '{applicant,fullName}', '')), '');
  v_applicant_email := nullif(btrim(coalesce(p_payload #>> '{applicant,email}', '')), '');
  v_applicant_phone := nullif(btrim(coalesce(p_payload #>> '{applicant,phone}', '')), '');

  insert into public.registration_intake (
    id,
    org_id,
    status,
    source,
    submitted_at,
    applicant_name,
    applicant_email,
    applicant_phone,
    student_full_name,
    student_date_of_birth,
    instrument,
    requested_activity_id,
    notes,
    guardians,
    consent_accepted,
    consent_agreement_id,
    created_at,
    updated_at,
    created_by,
    updated_by,
    status_history
  ) values (
    v_id,
    v_endpoint.org_id,
    'PENDING',
    'WEBSITE',
    v_now,
    v_applicant_name,
    v_applicant_email,
    v_applicant_phone,
    v_student_name,
    v_student_date::date,
    v_instrument,
    v_requested_activity_id,
    v_notes,
    v_guardians,
    true,
    v_endpoint.consent_agreement_id,
    v_now,
    v_now,
    'public-submit',
    'public-submit',
    jsonb_build_array(jsonb_build_object(
      'id', v_id || ':' || (to_jsonb(v_now)#>>'{}') || ':PENDING:1',
      'status', 'PENDING',
      'fromStatus', null,
      'at', (to_jsonb(v_now)#>>'{}'),
      'by', 'public-submit',
      'note', 'Public registration submitted with explicit consent.'
    ))
  );

  update public.public_endpoints
     set last_used_at = v_now,
         updated_at = v_now,
         updated_by = 'public-submit'
   where id = v_endpoint.id;

  return jsonb_build_object(
    'ok', true,
    'intakeId', v_id,
    'submittedAt', to_jsonb(v_now)#>>'{}'
  );
exception
  when invalid_datetime_format then
    return jsonb_build_object('ok', false, 'code', 'MISSING_STUDENT');
  when others then
    return jsonb_build_object('ok', false, 'code', 'SUBMIT_FAILED');
end;
$$;

revoke all on function public.submit_registration_intake(text, jsonb) from public;
grant execute on function public.submit_registration_intake(text, jsonb) to anon;
grant execute on function public.submit_registration_intake(text, jsonb) to authenticated;

comment on function public.submit_registration_intake(text, jsonb) is
  'D-07 controlled public registration intake submit path. Validates a public_endpoints token hash and consent setup, then inserts only a quarantined registration_intake row.';
