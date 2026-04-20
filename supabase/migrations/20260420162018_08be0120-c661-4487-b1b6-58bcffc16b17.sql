-- Enums for job_files
CREATE TYPE public.file_entity_type AS ENUM ('job_occurrence', 'job_series', 'quote', 'invoice');
CREATE TYPE public.file_kind AS ENUM ('photo_before', 'photo_after', 'photo_during', 'attachment', 'signature');

-- job_files table
CREATE TABLE public.job_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  entity_type public.file_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  file_kind public.file_kind NOT NULL,
  bucket_id text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  caption text,
  signed_by_name text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX idx_job_files_tenant ON public.job_files(tenant_id);
CREATE INDEX idx_job_files_entity ON public.job_files(entity_type, entity_id);
CREATE INDEX idx_job_files_kind ON public.job_files(file_kind);
CREATE INDEX idx_job_files_creator ON public.job_files(created_by_user_id);

-- updated_at trigger
CREATE TRIGGER trg_job_files_updated_at
  BEFORE UPDATE ON public.job_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on job_files
ALTER TABLE public.job_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view job files"
  ON public.job_files FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members insert job files"
  ON public.job_files FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Admins or uploader update job files"
  ON public.job_files FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'business_admin'::user_role)
      OR created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins or uploader delete job files"
  ON public.job_files FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'business_admin'::user_role)
      OR created_by_user_id = auth.uid()
    )
  );

-- Create storage buckets (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('job-photos', 'job-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('job-attachments', 'job-attachments', false, 20971520, NULL),
  ('signatures', 'signatures', false, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
-- Path convention: {tenant_id}/...  → first folder segment is tenant_id

-- job-photos
CREATE POLICY "Tenant members read job-photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'job-photos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Tenant members upload job-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-photos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins or uploader update job-photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'job-photos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(), 'business_admin'::user_role) OR owner = auth.uid())
  );

CREATE POLICY "Admins or uploader delete job-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-photos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(), 'business_admin'::user_role) OR owner = auth.uid())
  );

-- job-attachments
CREATE POLICY "Tenant members read job-attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Tenant members upload job-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins or uploader update job-attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(), 'business_admin'::user_role) OR owner = auth.uid())
  );

CREATE POLICY "Admins or uploader delete job-attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND (public.has_role(auth.uid(), 'business_admin'::user_role) OR owner = auth.uid())
  );

-- signatures
CREATE POLICY "Tenant members read signatures"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Tenant members upload signatures"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins delete signatures"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
  );