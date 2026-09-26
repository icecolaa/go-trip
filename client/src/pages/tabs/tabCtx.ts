import type { TripBundle, WeatherDay } from '../../types';

export interface TabCtx {
  bundle: TripBundle;
  reload: () => void;
  reloadWeather: () => void;
  weather: WeatherDay[];
  canEdit: boolean;
  /** 跳转到另一个板块（改 URL query，保持单页结构） */
  goTab: (tab: string) => void;
}
