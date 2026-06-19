-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0011 · Public agreement acceptance read path
--
-- D-07/D-14: public signers may read only the exact agreement template/body and
-- request target behind a scoped AGREEMENT_ACCEPTANCE endpoint. This migration
-- does not grant anon SELECT on agreement tables or storage.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.get_public_agreement_acceptance(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint public.public_endpoints%rowtype;
  v_acceptance public.agreement_acceptances%rowtype;
  v_template public.agreement_templates%rowtype;
  v_now timestamptz := now();
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

  if v_acceptance.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED');
  end if;

  if v_acceptance.template_id <> v_endpoint.consent_agreement_id then
    return jsonb_build_object('ok', false, 'code', 'CONSENT_MISMATCH');
  end if;

  select *
    into v_template
    from public.agreement_templates
   where id = v_acceptance.template_id
     and org_id = v_acceptance.org_id
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND');
  end if;

  return jsonb_build_object(
    'ok', true,
    'expiresAt', to_jsonb(v_endpoint.expires_at)#>>'{}',
    'endpointLabel', v_endpoint.label,
    'template', jsonb_build_object(
      'id', v_template.id,
      'kind', v_template.kind,
      'title', v_template.title,
      'version', v_template.version,
      'body', v_template.body,
      'requiresGuardian', v_template.requires_guardian
    ),
    'acceptance', jsonb_build_object(
      'id', v_acceptance.id,
      'templateId', v_acceptance.template_id,
      'templateVersion', v_acceptance.template_version,
      'studentId', v_acceptance.student_id,
      'familyId', v_acceptance.family_id,
      'enrollmentId', v_acceptance.enrollment_id,
      'guardianId', v_acceptance.guardian_id,
      'status', v_acceptance.status
    ),
    'target', jsonb_build_object(
      'label', v_endpoint.label,
      'studentId', v_acceptance.student_id,
      'familyId', v_acceptance.family_id,
      'enrollmentId', v_acceptance.enrollment_id,
      'guardianId', v_acceptance.guardian_id
    )
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'code', 'SUBMIT_FAILED');
end;
$$;

revoke all on function public.get_public_agreement_acceptance(text) from public;
grant execute on function public.get_public_agreement_acceptance(text) to anon;
grant execute on function public.get_public_agreement_acceptance(text) to authenticated;

comment on function public.get_public_agreement_acceptance(text) is
  'D-07/D-14 controlled public agreement read path. Validates public_endpoints and returns only one pending acceptance target plus its template body.';
