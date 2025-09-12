-- Rename materials_needed column to additional_info in jobs table
ALTER TABLE jobs 
RENAME COLUMN materials_needed TO additional_info;