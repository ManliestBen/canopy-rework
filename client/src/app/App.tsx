import { Navigate, Route, Routes } from 'react-router-dom';
import { Onboarding } from '../components/Onboarding';
import { useSettings } from '../theme/ThemeProvider';
import { TasksPage } from '../features/household/TasksPage';
import { WeatherPage } from '../features/weather/WeatherPage';
import { CalendarPage } from '../pages/CalendarPage';
import { ChoresPage } from '../pages/ChoresPage';
import { ListsPage } from '../pages/ListsPage';
import { MealsPage } from '../pages/MealsPage';
import { PhotosPage } from '../pages/PhotosPage';
import { RewardsPage } from '../pages/RewardsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SleepPage } from '../pages/SleepPage';
import { Header } from './Header';
import { Rail } from './Rail';

export function App() {
  const settings = useSettings();
  if (!settings.onboarded) {
    return <Onboarding />;
  }
  return (
    <div className="shell">
      <Rail />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/chores" element={<ChoresPage />} />
          <Route path="/rewards" element={<RewardsPage />} />
          <Route path="/todos" element={<TasksPage />} />
          <Route path="/meals" element={<MealsPage />} />
          <Route path="/photos" element={<PhotosPage />} />
          <Route path="/lists" element={<ListsPage />} />
          <Route path="/sleep" element={<SleepPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>
    </div>
  );
}
