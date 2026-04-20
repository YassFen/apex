-- ─── SEED: MOVEMENTS ────────────────────────────────────────────────────────
-- Run this AFTER 001_initial_schema.sql succeeds

insert into public.movements (name, category, description) values
  -- Weightlifting
  ('Back Squat',        'weightlifting', 'Barbell squat with bar on upper back'),
  ('Front Squat',       'weightlifting', 'Barbell squat with bar racked on front delts'),
  ('Overhead Squat',    'weightlifting', 'Squat with barbell locked out overhead'),
  ('Deadlift',          'weightlifting', 'Hip hinge pulling barbell from floor'),
  ('Romanian Deadlift', 'weightlifting', 'Hip hinge with slight knee bend, bar stays close'),
  ('Bench Press',       'weightlifting', 'Horizontal press on bench'),
  ('Strict Press',      'weightlifting', 'Vertical press from shoulder rack, no leg drive'),
  ('Push Press',        'weightlifting', 'Vertical press with hip dip drive'),
  -- Olympic
  ('Clean',             'olympic', 'Pull barbell from floor to front rack in one motion'),
  ('Power Clean',       'olympic', 'Clean caught above parallel'),
  ('Hang Clean',        'olympic', 'Clean initiated from hang position'),
  ('Snatch',            'olympic', 'Pull barbell from floor to locked out overhead'),
  ('Power Snatch',      'olympic', 'Snatch caught above parallel'),
  ('Clean & Jerk',      'olympic', 'Clean followed by jerk to lockout overhead'),
  -- Gymnastics
  ('Pull-up',           'gymnastics', 'Dead hang pull to chin over bar'),
  ('Chest-to-Bar',      'gymnastics', 'Pull-up where chest touches bar'),
  ('Muscle-up',         'gymnastics', 'Pull-up transitioning to dip above rings or bar'),
  ('Handstand Push-up', 'gymnastics', 'Inverted push-up against wall'),
  ('Toes-to-Bar',       'gymnastics', 'Hanging from bar, raise toes to touch bar'),
  -- Benchmark
  ('Fran',              'benchmark', '21-15-9 Thrusters (95/65) + Pull-ups'),
  ('Grace',             'benchmark', '30 Clean & Jerks for time (135/95)'),
  ('Helen',             'benchmark', '3 rounds: 400m Run, 21 KB Swings, 12 Pull-ups'),
  ('Diane',             'benchmark', '21-15-9 Deadlifts (225/155) + Handstand Push-ups'),
  -- Cardio
  ('Row 500m',          'cardio', '500 meter ergometer row for time'),
  ('Row 1000m',         'cardio', '1000 meter ergometer row for time'),
  ('Run 400m',          'cardio', '400 meter run for time'),
  ('Run 1 Mile',        'cardio', '1 mile run for time')
on conflict (name) do nothing;
