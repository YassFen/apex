-- 015: un solo WOD por box y por día (el mismo para todas las clases).
-- Idempotente: se puede correr varias veces. La columna class_time se conserva, pero ya no se usa.
begin;

do $$
begin
  -- Para cada (box, día) con varios WODs, elegimos el que tiene más resultados
  -- (empate: el publicado más tarde) y movemos a él los resultados de los demás.
  create temp table _wod_rank on commit drop as
    select d.id, d.box_id, d.scheduled_for,
           row_number() over (
             partition by d.box_id, d.scheduled_for
             order by (select count(*) from public.wod_results r where r.daily_wod_id = d.id) desc,
                      d.published_at desc nulls last, d.id
           ) as rn
    from public.daily_wods d;

  create temp table _wod_keep on commit drop as
    select k.id as keep_id, o.id as old_id
    from _wod_rank k
    join _wod_rank o on o.box_id = k.box_id and o.scheduled_for = k.scheduled_for and o.rn > 1
    where k.rn = 1;

  -- Resultados de atletas que aún no tienen resultado en el WOD que se queda.
  update public.wod_results r
     set daily_wod_id = k.keep_id
    from _wod_keep k
   where r.daily_wod_id = k.old_id
     and not exists (select 1 from public.wod_results x where x.daily_wod_id = k.keep_id and x.user_id = r.user_id)
     -- With 3+ WODs the same day an athlete may have several: move only their latest one.
     and r.id = (select r2.id from public.wod_results r2 join _wod_keep k2 on k2.old_id = r2.daily_wod_id
                  where k2.keep_id = k.keep_id and r2.user_id = r.user_id order by r2.recorded_at desc, r2.id limit 1);

  -- Los resultados que no se pudieron mover se borran junto con sus reacciones (cascade).
  delete from public.daily_wods d using _wod_keep k where d.id = k.old_id;

  update public.daily_wods set class_time = null where class_time is not null;
end $$;

create unique index if not exists daily_wods_box_day on public.daily_wods (box_id, scheduled_for);

commit;
