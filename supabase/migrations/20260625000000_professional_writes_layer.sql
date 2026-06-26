-- ===========================================================================
-- Step 11.6 — Professional Dashboards: WRITES layer
-- ===========================================================================
-- Until now professionals could only READ a connected client's data. This adds
-- the write actions, all through security-definer RPCs (a professional cannot
-- write to the client's rows directly — RLS forbids it by design). Every action
-- records a row in professional_edits for the audit trail + the client's
-- "Professional Updates" feed, and the client can UNDO trainer changes within a
-- 48-hour window.
--
-- Actions:
--   • add_chef_note            chef attaches/updates/clears a note on one meal
--   • edit_client_goal         trainer changes diet_mode/health_goal/cooking_style
--                              (immediate; previous value captured for revert)
--   • queue_meal_adjustment    trainer queues a plan tweak for the next generation
--   • revert_professional_edit CLIENT undoes a change within 48h
--
-- Idempotent: CREATE OR REPLACE throughout.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Chef note — one visible note per meal. Re-saving supersedes the prior note
-- (so there's always at most one 'applied' note per meal); an empty note just
-- clears it. Chef-role only.
-- ---------------------------------------------------------------------------
create or replace function public.add_chef_note(
  p_client_id uuid,
  p_meal_id   text,
  p_note      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro       uuid := auth.uid();
  v_conn      public.professional_connections;
  v_pro_name  text;
  v_trimmed   text := nullif(btrim(p_note), '');
begin
  if v_pro is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_conn
    from public.professional_connections
   where client_id = p_client_id
     and professional_id = v_pro
     and role = 'chef'
     and status = 'active'
   limit 1;
  if not found then
    raise exception 'Not authorized as this client''s chef';
  end if;

  select full_name into v_pro_name from public.users where id = v_pro;

  -- Supersede any prior note on this meal (keeps one 'applied' note per meal).
  update public.professional_edits
     set status = 'reverted', reverted_at = now()
   where client_id = p_client_id
     and professional_id = v_pro
     and edit_type = 'note'
     and target_reference = p_meal_id
     and status = 'applied';

  -- Empty note = clear only (the supersede above already removed the old one).
  if v_trimmed is null then
    return;
  end if;

  insert into public.professional_edits
    (connection_id, client_id, professional_id, professional_role,
     professional_name, edit_type, target_reference, new_value, status, applied_at)
  values
    (v_conn.id, p_client_id, v_pro, 'chef', v_pro_name, 'note',
     p_meal_id, v_trimmed, 'applied', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Trainer goal edit — change one of the three plan fields immediately, keeping
-- the previous value so the client can undo. Trainer-role only. The field name
-- is whitelisted AND quoted via %I, so the dynamic SQL is injection-safe.
-- ---------------------------------------------------------------------------
create or replace function public.edit_client_goal(
  p_client_id uuid,
  p_field     text,
  p_value     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro      uuid := auth.uid();
  v_conn     public.professional_connections;
  v_pro_name text;
  v_prev     text;
begin
  if v_pro is null then
    raise exception 'Not authenticated';
  end if;
  if p_field not in ('diet_mode','health_goal','cooking_style') then
    raise exception 'Invalid field';
  end if;

  select * into v_conn
    from public.professional_connections
   where client_id = p_client_id
     and professional_id = v_pro
     and role = 'trainer_nutritionist'
     and status = 'active'
   limit 1;
  if not found then
    raise exception 'Not authorized as this client''s trainer';
  end if;

  select full_name into v_pro_name from public.users where id = v_pro;

  -- Capture the previous value, then apply the change.
  execute format('select %I::text from public.users where id = $1', p_field)
    into v_prev using p_client_id;

  if v_prev is not distinct from p_value then
    return;  -- no-op: already set to this value
  end if;

  execute format('update public.users set %I = $1 where id = $2', p_field)
    using p_value, p_client_id;

  insert into public.professional_edits
    (connection_id, client_id, professional_id, professional_role,
     professional_name, edit_type, target_reference, previous_value, new_value,
     status, applied_at)
  values
    (v_conn.id, p_client_id, v_pro, 'trainer_nutritionist', v_pro_name,
     'goal_edit', p_field, v_prev, p_value, 'applied', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Trainer meal-plan adjustment — queued, consumed by the next plan generation
-- (autopilot / manual). Trainer-role only. Status starts 'pending_next_cycle'.
-- ---------------------------------------------------------------------------
create or replace function public.queue_meal_adjustment(
  p_client_id uuid,
  p_note      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro      uuid := auth.uid();
  v_conn     public.professional_connections;
  v_pro_name text;
  v_trimmed  text := nullif(btrim(p_note), '');
begin
  if v_pro is null then
    raise exception 'Not authenticated';
  end if;
  if v_trimmed is null then
    raise exception 'Add a short note describing the adjustment';
  end if;

  select * into v_conn
    from public.professional_connections
   where client_id = p_client_id
     and professional_id = v_pro
     and role = 'trainer_nutritionist'
     and status = 'active'
   limit 1;
  if not found then
    raise exception 'Not authorized as this client''s trainer';
  end if;

  select full_name into v_pro_name from public.users where id = v_pro;

  insert into public.professional_edits
    (connection_id, client_id, professional_id, professional_role,
     professional_name, edit_type, new_value, status)
  values
    (v_conn.id, p_client_id, v_pro, 'trainer_nutritionist', v_pro_name,
     'suggested_meal_adjustment', v_trimmed, 'pending_next_cycle');
end;
$$;

-- ---------------------------------------------------------------------------
-- Client revert — undo a professional change within 48 hours. The CLIENT only.
-- For a goal_edit, restores the previous value (but refuses if the setting has
-- since changed, to avoid clobbering a newer state). Notes + queued adjustments
-- just flip to 'reverted' so they stop showing / won't be consumed.
-- ---------------------------------------------------------------------------
create or replace function public.revert_professional_edit(p_edit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client  uuid := auth.uid();
  v_edit    public.professional_edits;
  v_current text;
begin
  if v_client is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_edit
    from public.professional_edits
   where id = p_edit_id and client_id = v_client
   for update;
  if not found then
    raise exception 'Update not found';
  end if;
  if v_edit.status = 'reverted' then
    raise exception 'This change was already undone';
  end if;
  if v_edit.created_at < now() - interval '48 hours' then
    raise exception 'The 48-hour window to undo this change has passed';
  end if;

  if v_edit.edit_type = 'goal_edit' and v_edit.target_reference is not null then
    execute format('select %I::text from public.users where id = $1',
                   v_edit.target_reference)
      into v_current using v_client;
    if v_current is distinct from v_edit.new_value then
      raise exception 'This setting has changed since; nothing to undo';
    end if;
    execute format('update public.users set %I = $1 where id = $2',
                   v_edit.target_reference)
      using v_edit.previous_value, v_client;
  end if;

  update public.professional_edits
     set status = 'reverted', reverted_at = now()
   where id = v_edit.id;
end;
$$;

grant execute on function public.add_chef_note(uuid, text, text)        to authenticated;
grant execute on function public.edit_client_goal(uuid, text, text)     to authenticated;
grant execute on function public.queue_meal_adjustment(uuid, text)      to authenticated;
grant execute on function public.revert_professional_edit(uuid)         to authenticated;

commit;
