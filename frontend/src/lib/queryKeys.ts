export const QK = {
  // Dashboard
  dashboardSummary: (from: string, to: string) => ['dashboard', 'summary', from, to] as const,
  dashboardTimeline: (params: object) => ['dashboard', 'timeline', params] as const,
  dashboardUnitPerf: (params: object) => ['dashboard', 'unit-performance', params] as const,

  // Tasks
  tasks: (params: object) => ['tasks', params] as const,
  task: (id: number) => ['tasks', id] as const,
  taskStats: (params?: object) => ['tasks', 'stats', params ?? {}] as const,

  // Documents
  documents: (params: object) => ['documents', params] as const,
  document: (id: number) => ['documents', id] as const,

  // Directives
  directives: (params: object) => ['directives', params] as const,
  directive: (id: number) => ['directives', id] as const,

  // KPI
  kpis: (params: object) => ['kpis', params] as const,
  kpi: (id: number) => ['kpis', id] as const,

  // Programs / NQ57
  programs: (params?: object) => ['programs', params ?? {}] as const,
  program: (id: number) => ['programs', id] as const,

  // Departments / Staff
  departments: () => ['departments'] as const,
  staff: (params?: object) => ['staff', params ?? {}] as const,

  // Directives stats
  directiveStats: () => ['directives', 'stats'] as const,
  docStats: () => ['documents', 'stats'] as const,
}
