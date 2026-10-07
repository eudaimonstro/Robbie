import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The version a document page shows, kept in its link (?version=): the version picked, or no
 * parameter for the current version. The link stays honest, so a reload, a copied link or a
 * later refetch shows the version on screen
 */
export function useVersionParam(): {
  versionId: string | null;
  chooseVersion: (versionId: string | null, currentVersionId?: string | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const chooseVersion = useCallback(
    (versionId: string | null, currentVersionId?: string | null) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          if (!versionId || versionId === currentVersionId) next.delete('version');
          else next.set('version', versionId);
          return next;
        },
        // Picking a version isn't a step to go back to
        { replace: true },
      );
    },
    [setSearchParams],
  );
  return { versionId: searchParams.get('version'), chooseVersion };
}
