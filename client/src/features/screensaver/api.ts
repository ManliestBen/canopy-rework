import { useQuery } from '@tanstack/react-query';
import { PhotoFoldersSchema, PhotosResponseSchema } from '@canopy/shared';
import { apiGet } from '../../lib/api';

export function usePhotos() {
  return useQuery({
    queryKey: ['photos'],
    queryFn: () => apiGet(PhotosResponseSchema, '/api/photos'),
    refetchInterval: 10 * 60_000,
  });
}

export function usePhotoFolders() {
  return useQuery({
    queryKey: ['photo-folders'],
    queryFn: () => apiGet(PhotoFoldersSchema, '/api/photos/folders'),
    staleTime: 10 * 60_000,
  });
}
