-- Phase 1: Fix Database Schema - Make rrule nullable for non-recurring jobs
ALTER TABLE job_series ALTER COLUMN rrule DROP NOT NULL;

-- Update any existing records that might have invalid rrule values
UPDATE job_series 
SET rrule = NULL 
WHERE is_recurring = false AND (rrule = '' OR rrule IS NULL);

-- Add a check constraint to ensure recurring jobs have an rrule
ALTER TABLE job_series ADD CONSTRAINT check_rrule_for_recurring 
CHECK (
  (is_recurring = true AND rrule IS NOT NULL AND rrule != '') OR 
  (is_recurring = false)
);