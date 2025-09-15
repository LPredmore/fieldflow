-- Add scheduled_end_time field to jobs table to support end time for one-time jobs
ALTER TABLE public.jobs 
ADD COLUMN scheduled_end_time text;