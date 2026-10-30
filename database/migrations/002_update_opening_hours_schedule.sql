-- Apply after 001_add_runtime_columns.sql on the intended database.
-- This updates the server-managed schedule to the approved restaurant hours.
-- It preserves the existing rows and keeps both legacy and split-session columns aligned.
UPDATE opening_hours
SET open_time = CASE day_key
      WHEN 'mon_thu' THEN '19:00:00'
      WHEN 'fri' THEN '19:00:00'
      WHEN 'sat' THEN '16:00:00'
      WHEN 'sun' THEN '16:00:00'
      ELSE open_time
    END,
    close_time = CASE
      WHEN day_key IN ('mon_thu', 'fri', 'sat', 'sun') THEN '21:00:00'
      ELSE close_time
    END,
    is_closed = CASE
      WHEN day_key IN ('mon_thu', 'fri', 'sat', 'sun') THEN FALSE
      ELSE is_closed
    END,
    morning_open = NULL,
    morning_close = NULL,
    morning_closed = TRUE,
    evening_open = CASE day_key
      WHEN 'mon_thu' THEN '19:00:00'
      WHEN 'fri' THEN '19:00:00'
      WHEN 'sat' THEN '16:00:00'
      WHEN 'sun' THEN '16:00:00'
      ELSE evening_open
    END,
    evening_close = CASE
      WHEN day_key IN ('mon_thu', 'fri', 'sat', 'sun') THEN '21:00:00'
      ELSE evening_close
    END,
    evening_closed = CASE
      WHEN day_key IN ('mon_thu', 'fri', 'sat', 'sun') THEN FALSE
      ELSE evening_closed
    END
WHERE day_key IN ('mon_thu', 'fri', 'sat', 'sun');
