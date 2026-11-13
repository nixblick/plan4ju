"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { HEX_COLOR, MAP_ICONS, type MapIcon } from "@/lib/map";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  icon: MapIcon;
  color: string;
  href: string;
}

/** Marker markup from the built-in icon set only; names are set as text by Leaflet's tooltip (escaped below). */
function markerHtml(icon: MapIcon, color: string, ring = false): string {
  const c = HEX_COLOR.test(color) ? color : "#c2410c";
  const path = MAP_ICONS[icon] ?? MAP_ICONS.pin;
  return `<span style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9999px;background:${c};border:2px solid ${ring ? "#1c1917" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.35)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg></span>`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Leaflet map (bundled locally). Tiles come from the configured server; without one the map stays grey.
 * pick: a map click (or dragging the pick marker) writes the position into the inputs with these ids.
 */
export function MapView({
  tileUrl,
  attribution,
  points,
  pick,
  pickStart,
  height = "h-72 md:h-[28rem]",
}: {
  tileUrl: string;
  attribution: string;
  points: MapPoint[];
  pick?: { lat: string; lng: string };
  pickStart?: { lat: number; lng: number };
  height?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false });
      if (tileUrl) {
        L.tileLayer(tileUrl, { maxZoom: 19, attribution, referrerPolicy: "strict-origin-when-cross-origin" } as L.TileLayerOptions).addTo(map);
      }
      const bounds: [number, number][] = [];
      for (const p of points) {
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: markerHtml(p.icon, p.color), className: "", iconSize: [34, 34], iconAnchor: [17, 17] }),
          title: p.name,
          alt: p.name,
          keyboard: true,
        }).addTo(map);
        m.bindPopup(`<a href="${encodeURI(p.href)}" style="font-weight:600">${escapeHtml(p.name)}</a>`);
        bounds.push([p.lat, p.lng]);
      }
      if (pickStart) bounds.push([pickStart.lat, pickStart.lng]);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else if (bounds.length === 1) map.setView(bounds[0]!, 14);
      else map.setView([51.1, 10.4], 5); // neutral overview of Germany

      if (pick) {
        let marker: Marker | null = null;
        const write = (lat: number, lng: number) => {
          const a = document.getElementById(pick.lat) as HTMLInputElement | null;
          const b = document.getElementById(pick.lng) as HTMLInputElement | null;
          if (a) a.value = lat.toFixed(6);
          if (b) b.value = lng.toFixed(6);
        };
        const place = (lat: number, lng: number) => {
          if (!map) return;
          if (!marker) {
            marker = L.marker([lat, lng], {
              draggable: true,
              icon: L.divIcon({ html: markerHtml("pin", "#1c1917", true), className: "", iconSize: [34, 34], iconAnchor: [17, 17] }),
              title: "Neue Position",
            }).addTo(map);
            marker.on("dragend", () => {
              const ll = marker!.getLatLng();
              write(ll.lat, ll.lng);
            });
          } else marker.setLatLng([lat, lng]);
        };
        if (pickStart) place(pickStart.lat, pickStart.lng);
        map.on("click", (e) => {
          place(e.latlng.lat, e.latlng.lng);
          write(e.latlng.lat, e.latlng.lng);
        });
      }
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [tileUrl, attribution, points, pick, pickStart]);

  return (
    <div
      ref={box}
      data-testid="karte"
      role="region"
      aria-label={pick ? "Karte – tippe, um die Position zu setzen" : "Karte"}
      className={`relative z-0 w-full overflow-hidden rounded-2xl bg-stone-200 ring-1 ring-stone-200 ${height}`}
    />
  );
}
