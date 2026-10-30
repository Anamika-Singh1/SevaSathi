-- Fictional fixtures only. These are not valid certificate or citizen records.
insert into public.applications (
  id, reference_number, applicant_name, village, district, taluk, annual_income,
  purpose, status, is_demo, submitted_at
)
select
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'SS-2026-' || lpad(n::text, 4, '0'),
  (array['ಮಾದರಿ ಅರ್ಜಿದಾರ ಅ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಆ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಇ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಈ',
    'ಮಾದರಿ ಅರ್ಜಿದಾರ ಉ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಊ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಋ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಎ',
    'ಮಾದರಿ ಅರ್ಜಿದಾರ ಏ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಐ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಒ','ಮಾದರಿ ಅರ್ಜಿದಾರ ಓ'])[n],
  (array['ಮಾದರಿ ಗ್ರಾಮ ೧','ಮಾದರಿ ಗ್ರಾಮ ೨','ಮಾದರಿ ಗ್ರಾಮ ೩','ಮಾದರಿ ಗ್ರಾಮ ೪'])[(n - 1) % 4 + 1],
  'ಮೈಸೂರು', 'ಮೈಸೂರು',
  (array[48000,72000,96000,60000,84000,120000,36000,54000,108000,66000,90000,42000])[n],
  (array['ವಿದ್ಯಾರ್ಥಿವೇತನ / Scholarship','ಶೈಕ್ಷಣಿಕ ನೆರವು / Education support','ಸರ್ಕಾರಿ ಸೌಲಭ್ಯ / Government benefit'])[(n - 1) % 3 + 1],
  (array['SUBMITTED','SUBMITTED','SUBMITTED','FIELD_VERIFICATION','FIELD_VERIFICATION',
    'FIELD_VERIFICATION','UNDER_REVIEW','UNDER_REVIEW','PENDING_APPROVAL',
    'PENDING_APPROVAL','APPROVED','REJECTED'])[n]::public.application_status,
  true,
  '2026-10-15 04:30:00+00'::timestamptz + (n || ' days')::interval
from generate_series(1, 12) n
on conflict (reference_number) do nothing;

insert into public.application_documents(id, application_id, document_type, file_name, is_demo)
select
  ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ಆದಾಯ ಘೋಷಣೆ / Income declaration',
  'fictional-income-declaration-' || n || '.pdf', true
from generate_series(1, 12) n
on conflict (id) do nothing;

insert into public.application_notes(id, application_id, body)
select
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ಪ್ರಾತ್ಯಕ್ಷಿಕೆಗಾಗಿ ಮಾತ್ರ. ಎಲ್ಲಾ ವಿವರಗಳು ಕಾಲ್ಪನಿಕ. / Demo only. All details are fictional.'
from generate_series(1, 12) n
on conflict (id) do nothing;
