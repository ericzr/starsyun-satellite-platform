-- Apply before deploying tasking time-zone confirmation. Existing inquiries remain valid.
alter table public.inquiries add column if not exists capture_window jsonb;
alter table public.inquiries add column if not exists aoi_geometry jsonb;
comment on column public.inquiries.capture_window is
  'Confirmed inclusive local dates and IANA time zone; server-derived UTC half-open interval. Not a guaranteed satellite pass.';
comment on column public.inquiries.aoi_geometry is
  'Customer AOI Polygon or MultiPolygon in WGS84. Bounding boxes are only used for coarse catalogue search.';
