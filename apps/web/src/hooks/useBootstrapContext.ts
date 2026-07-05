import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore, useUiStore } from '../store';

/**
 * Bootstraps org + project context after login.
 * Loads the user's first org, then the first project in that org,
 * and writes them into the UiStore so all pages can use selectedOrgId / selectedProjectId.
 */
export function useBootstrapContext() {
  const { user } = useAuthStore();
  const { selectedOrgId, selectedProjectId, setSelectedOrg, setSelectedProject } = useUiStore();

  const { data: orgsData } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.listOrgs(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const orgs: any[] = (orgsData as any)?.data || [];
  const firstOrg = orgs[0];

  const { data: projectsData } = useQuery({
    queryKey: ['projects', firstOrg?.id],
    queryFn: () => api.listProjects(firstOrg!.id),
    enabled: !!firstOrg,
    staleTime: 60_000,
  });

  const projects: any[] = (projectsData as any)?.data || [];
  const firstProject = projects[0];

  useEffect(() => {
    if (firstOrg && !selectedOrgId) {
      setSelectedOrg(firstOrg.id);
    }
  }, [firstOrg, selectedOrgId, setSelectedOrg]);

  useEffect(() => {
    if (firstProject && !selectedProjectId) {
      setSelectedProject(firstProject.id);
    }
  }, [firstProject, selectedProjectId, setSelectedProject]);

  return {
    orgId: selectedOrgId || firstOrg?.id || null,
    projectId: selectedProjectId || firstProject?.id || null,
    org: firstOrg,
    project: firstProject,
  };
}
