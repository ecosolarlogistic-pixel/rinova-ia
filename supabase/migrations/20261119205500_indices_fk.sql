-- Índices para llaves foráneas señaladas por el asesor de rendimiento
create index if not exists activity_log_user_idx on public.activity_log (user_id);
create index if not exists budgets_created_by_idx on public.budgets (created_by);
create index if not exists budgets_version_idx on public.budgets (version_id);
create index if not exists leads_project_idx on public.leads (project_id);
create index if not exists project_versions_created_by_idx on public.project_versions (created_by);
