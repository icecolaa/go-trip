import type { TripBundle, WeatherDay } from '@shared/types';

export interface TabCtx {
  bundle: TripBundle;
  reload: () => void;
  reloadWeather: () => void;
  weather: WeatherDay[];
  canEdit: boolean;
}
