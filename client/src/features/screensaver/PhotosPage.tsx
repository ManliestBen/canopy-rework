import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PhotosResponseSchema, SettingsSchema } from '@canopy/shared';
import { useState } from 'react';
import { apiSend } from '../../lib/api';
import { settingsQuery, useSettings } from '../../theme/ThemeProvider';
import { Slideshow } from './Slideshow';
import { usePhotoFolders, usePhotos } from './api';
import { STARTER_PHOTOS } from './starterPhotos';
import './screensaver.css';

export function PhotosPage() {
  const { data } = usePhotos();
  const { data: folders = [] } = usePhotoFolders();
  const settings = useSettings();
  const qc = useQueryClient();
  const [showSlideshow, setShowSlideshow] = useState(false);

  const setFolder = useMutation({
    mutationFn: (photoFolder: string) =>
      apiSend(SettingsSchema, 'PATCH', '/api/settings', { photoFolder }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQuery.queryKey });
      // Refetch photos for the new folder immediately.
      await apiSend(PhotosResponseSchema, 'POST', '/api/photos/refresh');
      await qc.invalidateQueries({ queryKey: ['photos'] });
    },
  });

  const photos = data?.photos ?? [];
  const showingStarters = !data?.configured || photos.length === 0;

  return (
    <div>
      <div className="cal-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          Photos
        </h1>
        <div style={{ flex: 1 }} />
        {folders.length > 0 && (
          <select
            className="input"
            style={{ maxWidth: 260 }}
            value={settings.photoFolder}
            onChange={(e) => setFolder.mutate(e.target.value)}
          >
            <option value="">All photos</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setShowSlideshow(true)}>
          ▶ Slideshow
        </button>
      </div>

      {!data?.configured && (
        <div className="cal-warning" style={{ marginBottom: 14 }}>
          Cloudinary isn't connected yet (CLOUDINARY_URL) — showing the built-in
          starter set. See the setup guide to connect your photo library.
        </div>
      )}
      {data?.error && <div className="cal-warning">⚠️ {data.error}</div>}

      <div className="photos-grid">
        {(showingStarters ? STARTER_PHOTOS : photos).map((p) => (
          <img key={p.id} src={p.url} alt="" loading="lazy" />
        ))}
      </div>

      {showSlideshow && <Slideshow onWake={() => setShowSlideshow(false)} />}
    </div>
  );
}
