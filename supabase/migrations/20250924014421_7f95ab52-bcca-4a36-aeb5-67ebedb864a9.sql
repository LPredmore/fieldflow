-- Fix the view by removing RLS (not supported on views) and rely on base table RLS

DROP VIEW IF EXISTS jobs_calendar_upcoming;

-- Simple view that inherits security from base tables
CREATE VIEW jobs_calendar_upcoming AS
SELECT 
  CASE 
    WHEN js.is_recurring = false THEN js.id
    ELSE jo.id
  END as id,
  CASE 
    WHEN js.is_recurring = false THEN js.tenant_id
    ELSE jo.tenant_id
  END as tenant_id,
  CASE 
    WHEN js.is_recurring = false THEN js.customer_id
    ELSE jo.customer_id
  END as customer_id,
  CASE 
    WHEN js.is_recurring = false THEN js.assigned_to_user_id
    ELSE jo.assigned_to_user_id
  END as assigned_to_user_id,
  CASE 
    WHEN js.is_recurring = false THEN js.title
    ELSE COALESCE(jo.override_title, js.title)
  END as title,
  CASE 
    WHEN js.is_recurring = false THEN js.description
    ELSE COALESCE(jo.override_description, js.description)
  END as description,
  CASE 
    WHEN js.is_recurring = false THEN js.scheduled_time_utc
    ELSE jo.start_at
  END as start_at,
  CASE 
    WHEN js.is_recurring = false THEN js.scheduled_end_time_utc
    ELSE jo.end_at
  END as end_at,
  CASE 
    WHEN js.is_recurring = false THEN js.status
    ELSE jo.status
  END as status,
  CASE 
    WHEN js.is_recurring = false THEN js.priority
    ELSE jo.priority
  END as priority,
  CASE 
    WHEN js.is_recurring = false THEN js.estimated_cost
    ELSE COALESCE(jo.override_estimated_cost, js.estimated_cost)
  END as estimated_cost,
  CASE 
    WHEN js.is_recurring = false THEN js.actual_cost
    ELSE jo.actual_cost
  END as actual_cost,
  CASE 
    WHEN js.is_recurring = false THEN js.completion_notes
    ELSE jo.completion_notes
  END as completion_notes,
  CASE 
    WHEN js.is_recurring = false THEN 'one_time'
    ELSE 'recurring_instance'
  END as job_type,
  CASE 
    WHEN js.is_recurring = false THEN js.created_at
    ELSE jo.created_at
  END as created_at,
  CASE 
    WHEN js.is_recurring = false THEN js.updated_at
    ELSE jo.updated_at
  END as updated_at,
  -- Get customer name from customers table
  c.name as customer_name
FROM job_series js
LEFT JOIN job_occurrences jo ON js.id = jo.series_id
LEFT JOIN customers c ON COALESCE(jo.customer_id, js.customer_id) = c.id
WHERE 
  (js.is_recurring = false AND js.scheduled_time_utc IS NOT NULL)
  OR 
  (js.is_recurring = true AND jo.id IS NOT NULL);