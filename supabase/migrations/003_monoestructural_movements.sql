-- APEX-MIG-003: Agrega movimientos monoestructurales faltantes (Ski, Bike, Aerobike)
-- y variantes genéricas por calorías para métricas de tiempo/calorías.
--
-- Ejecutar manualmente en Supabase Dashboard → SQL Editor.
-- Idempotente: usa ON CONFLICT DO NOTHING sobre el nombre único.

-- Garantizamos unicidad en movements.name para poder usar ON CONFLICT (name)
-- (si no existía ya).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'movements' AND indexname = 'movements_name_key'
  ) THEN
    BEGIN
      ALTER TABLE public.movements ADD CONSTRAINT movements_name_key UNIQUE (name);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

INSERT INTO public.movements (name, category, description) VALUES
  ('Ski Erg',                'cardio',    'Esquiadora vertical — registrar tiempo de distancia o calorías'),
  ('Assault Bike',           'cardio',    'Bicicleta de asalto — registrar tiempo hasta X calorías'),
  ('Aerobike',               'cardio',    'Aerodyne / Aerobike — tiempo o calorías'),
  ('Echo Bike',              'cardio',    'Rogue Echo Bike — tiempo o calorías'),
  ('Rower (Row)',            'cardio',    'Remoergómetro — tiempo en distancia o calorías'),
  ('30 cal Row',             'cardio',    'Tiempo para completar 30 calorías en remo'),
  ('50 cal Row',             'cardio',    'Tiempo para completar 50 calorías en remo'),
  ('30 cal Bike',            'cardio',    'Tiempo para completar 30 calorías en bicicleta'),
  ('50 cal Bike',            'cardio',    'Tiempo para completar 50 calorías en bicicleta'),
  ('30 cal Ski',             'cardio',    'Tiempo para completar 30 calorías en Ski Erg'),
  ('500m Row',               'cardio',    'Tiempo para completar 500m en remo'),
  ('1000m Row',              'cardio',    'Tiempo para completar 1000m en remo'),
  ('2000m Row',              'cardio',    'Tiempo para completar 2000m en remo')
ON CONFLICT (name) DO NOTHING;

-- Nota: la categoría 'cardio' se muestra en la UI como "Monoestructural".
-- No renombramos la columna para no invalidar constraints/código existente.
