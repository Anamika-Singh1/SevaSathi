-- Optional, repeatable enrichment of the 12 exact fictional fixtures only.
-- Run after Phase 2 migration AND seed.sql. Never changes real applications.
update public.applications a set
  stage_entered_at = a.submitted_at + case when a.status = 'SUBMITTED' then interval '0 days' else interval '1 day' end,
  target_date = (a.submitted_at at time zone 'Asia/Kolkata')::date + 10,
  processed_at = case when a.status in ('APPROVED', 'REJECTED') then a.submitted_at + interval '2 days' else null end,
  unresolved_actions = case
    when a.reference_number in ('SS-2026-0002', 'SS-2026-0005') then array['ಆದಾಯ ಘೋಷಣೆ ಸ್ಪಷ್ಟೀಕರಣ ಬಾಕಿ / Income declaration clarification pending']
    when a.reference_number = 'SS-2026-0007' then array['ಕ್ಷೇತ್ರ ವರದಿ ಪರಿಶೀಲಿಸಿ / Review field report', 'ಆದಾಯ ದಾಖಲೆ ಹೊಂದಾಣಿಕೆ / Reconcile income record']
    else '{}'::text[] end,
  field_report = case when a.status in ('UNDER_REVIEW', 'PENDING_APPROVAL', 'APPROVED')
    then 'ಕಾಲ್ಪನಿಕ ಕ್ಷೇತ್ರ ಭೇಟಿ ಪೂರ್ಣಗೊಂಡಿದೆ. ಆದಾಯ ಘೋಷಣೆ ಮತ್ತು ಗ್ರಾಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲನೆಗೆ ದಾಖಲಿಸಲಾಗಿದೆ. / Fictional field visit completed. Income declaration and village details recorded for review.' else null end
where a.is_demo and a.id in (
  select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 12) n
);
