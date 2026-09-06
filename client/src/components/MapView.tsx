import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  dayNumber?: number;
  color?: string;
}

const DAY_COLORS = ['#2f6e4f', '#d9752b', '#3b6ea5', '#b5543b', '#7d5ba6', '#4e8d7c', '#c9a04e', '#5d6d4e', '#a0433b', '#476b8a', '#8a5a2f', '#5a4f8a', '#2f6e4f', '#d9752b', '#3b6ea5', '#b5543b', '#7d5ba6', '#4e8d7c', '#c9a04e', '#5d6d4e', '#a0433b', '#476b8a', '#8a5a2f', '#5a4f8a', '#2f6e4f', '#d9752b', '#3b6ea5', '#b5543b', '#7d5ba6', '#4e8d7c'];

export function dayColor(n: number | undefined): string {
  return DAY_COLORS[((n || 1) - 1) % DAY_COLORS.length];
}

const amapLayer = (satellite: boolean) =>
  L.tileLayer(
    satellite
      ? 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'
      : 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    {
      maxZoom: 18,
      minZoom: 3,
      attribution: '© 高德地图 AutoNavi',
      subdomains: ['1', '2', '3', '4'],
    }
  );

function markerIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 4px;
      background:${color};transform:rotate(-45deg);
      box-shadow:0 3px 8px rgba(40,30,10,.35);
      border:2.5px solid #fffdf6;display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);color:#fff;font-size:11.5px;font-weight:800;">${label}</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

export default function MapView({
  points,
  initialCenter,
  initialZoom = 11,
  height,
  showRoute = true,
}: {
  points: MapPoint[];
  initialCenter?: [number, number];
  initialZoom?: number;
  height?: number | string;
  showRoute?: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // 初始化地图（一次）
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { center: initialCenter || [35.86, 104.19], zoom: initialZoom, zoomControl: true });
    const amap = amapLayer(false);
    const sat = amapLayer(true);
    amap.addTo(map);
    L.control.layers({ '高德地图': amap, '高德卫星图': sat }, {}, { position: 'topright' }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 绘制点位
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const valid = points.filter(p => isFinite(p.lat) && isFinite(p.lng));
    if (!valid.length) {
      if (initialCenter) map.setView(initialCenter, initialZoom);
      return;
    }
    valid.forEach(p => {
      const m = L.marker([p.lat, p.lng], {
        icon: markerIcon(String(p.dayNumber || '•'), p.color || dayColor(p.dayNumber)),
      });
      m.bindPopup(
        `<div class="pop-title">${escapeHtml(p.title)}</div>` +
        (p.subtitle ? `<div class="pop-sub">${escapeHtml(p.subtitle)}</div>` : '')
      );
      m.addTo(layer);
    });
    if (showRoute && valid.length > 1) {
      L.polyline(
        valid.map(p => [p.lat, p.lng] as [number, number]),
        { color: '#d9752b', weight: 2.5, dashArray: '7 8', opacity: .75 }
      ).addTo(layer);
    }
    const bounds = L.latLngBounds(valid.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [46, 46], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, showRoute]);

  return <div ref={elRef} style={{ height: height || '100%', width: '100%' }} />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
