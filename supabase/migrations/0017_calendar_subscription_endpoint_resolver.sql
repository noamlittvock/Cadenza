-- Calendar/website integrations foundation.
-- D-07/D-14: private iCal tokens resolve through public_endpoints token hashes,
-- not broad anon table access or durable raw-token reads.

drop policy if exists calendar_subscriptions_read on public.calendar_subscriptions;
create policy calendar_subscriptions_read on public.calendar_subscriptions
  for select using (public.app_is_org_admin(org_id));

drop policy if exists calendar_subscriptions_write on public.calendar_subscriptions;
create policy calendar_subscriptions_write on public.calendar_subscriptions
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

create or replace function public.resolve_calendar_subscription_ical(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint public.public_endpoints%rowtype;
  v_subscription public.calendar_subscriptions%rowtype;
  v_filters jsonb;
  v_events jsonb;
begin
  select *
    into v_endpoint
  from public.public_endpoints
  where token_hash = p_token_hash
    and kind = 'CALENDAR_SUBSCRIPTION'
  limit 1;

  if v_endpoint.id is null
     or v_endpoint.status <> 'ACTIVE'
     or not (v_endpoint.scopes ? 'calendar_subscription:read')
     or v_endpoint.target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ENDPOINT');
  end if;

  if v_endpoint.expires_at is not null and v_endpoint.expires_at <= now() then
    update public.public_endpoints
       set status = 'EXPIRED',
           last_used_at = now(),
           updated_at = now()
     where id = v_endpoint.id;
    return jsonb_build_object('ok', false, 'code', 'INVALID_ENDPOINT');
  end if;

  select *
    into v_subscription
  from public.calendar_subscriptions
  where id = v_endpoint.target_id
    and org_id = v_endpoint.org_id;

  if v_subscription.id is null
     or coalesce((v_subscription.data->>'isActive')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET');
  end if;

  v_filters := coalesce(v_subscription.data->'filters', '{}'::jsonb);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.data->>'name',
      'description', e.data->>'description',
      'start', e.data->>'start',
      'end', e.data->>'end',
      'roomId', e.data->>'roomId',
      'activityId', e.data->>'activityId',
      'staffMemberIds', coalesce(e.data->'staffMemberIds', '[]'::jsonb),
      'tags', coalesce(e.data->'tags', '[]'::jsonb)
    ) order by e.data->>'start', e.id), '[]'::jsonb)
    into v_events
  from public.events e
  where e.org_id = v_endpoint.org_id
    and coalesce((e.data->>'isHidden')::boolean, false) is not true
    and coalesce((e.data->>'isCanceled')::boolean, false) is not true
    and (
      not (v_filters ? 'staffMemberIds')
      or jsonb_array_length(coalesce(v_filters->'staffMemberIds', '[]'::jsonb)) = 0
      or coalesce(v_filters->'staffMemberIds', '[]'::jsonb) ? coalesce(e.data->>'teacherId', '')
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(e.data->'staffMemberIds', '[]'::jsonb)) as event_staff(staff_id)
        where coalesce(v_filters->'staffMemberIds', '[]'::jsonb) ? event_staff.staff_id
      )
    )
    and (
      not (v_filters ? 'roomIds')
      or jsonb_array_length(coalesce(v_filters->'roomIds', '[]'::jsonb)) = 0
      or coalesce(v_filters->'roomIds', '[]'::jsonb) ? coalesce(e.data->>'roomId', '')
    )
    and (
      not (v_filters ? 'activityIds')
      or jsonb_array_length(coalesce(v_filters->'activityIds', '[]'::jsonb)) = 0
      or coalesce(v_filters->'activityIds', '[]'::jsonb) ? coalesce(e.data->>'activityId', '')
    )
    and (
      not (v_filters ? 'tags')
      or jsonb_array_length(coalesce(v_filters->'tags', '[]'::jsonb)) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(e.data->'tags', '[]'::jsonb)) as event_tags(tag)
        where coalesce(v_filters->'tags', '[]'::jsonb) ? event_tags.tag
      )
    );

  update public.public_endpoints
     set last_used_at = now(),
         updated_at = now()
   where id = v_endpoint.id;

  return jsonb_build_object(
    'ok', true,
    'subscriptionId', v_subscription.id,
    'label', v_endpoint.label,
    'events', v_events
  );
end;
$$;

revoke all on function public.resolve_calendar_subscription_ical(text) from public;
grant execute on function public.resolve_calendar_subscription_ical(text) to anon;
grant execute on function public.resolve_calendar_subscription_ical(text) to authenticated;

comment on function public.resolve_calendar_subscription_ical(text) is
  'D-07/D-14 controlled private iCal resolver. Validates public_endpoints token hash/scope/status/expiry and returns only filtered non-hidden calendar events.';
