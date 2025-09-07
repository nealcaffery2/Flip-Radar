'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Search, Moon, Sun } from "lucide-react";

// =============================================================
// Mapbox token via ENV (GitHub-safe; do NOT hardcode secrets)
// - Next.js: NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
// - Vite: VITE_MAPBOX_TOKEN in .env
// =============================================================
const MAPBOX_TOKEN =
  (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string)) ||
  // @ts-ignore Vite runtime env
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_MAPBOX_TOKEN) ||
  "";

if (!MAPBOX_TOKEN) {
  console.warn(
    "Missing Mapbox token. Set NEXT_PUBLIC_MAPBOX_TOKEN (Next.js) or VITE_MAPBOX_TOKEN (Vite) in your .env file."
  );
}

mapboxgl.accessToken = MAPBOX_TOKEN;

// ----------------------------- Types ---------------------------------------

type BuyerType = "flipper" | "landlord" | "cash" | "unknown";

type Buyer = { id: string; name: string; buyer_type: BuyerType; contacts: { phone?: string; email?: string }[] };

type Property = { id: string; addr1: string; city: string; state: string; zip: string; lat: number; lon: number };

type BuyerEvent = { id: string; buyer_id: string; property_id: string; event_type: "purchase" | "sale"; event_date: string; price: number; source: "county" | "mls" | "manual" };

// -------------------------- Seeded demo data -------------------------------

const buyers: Buyer[] = [
  { id: "b1", name: "Evergreen Residential LLC", buyer_type: "flipper", contacts: [{ phone: "210-555-0187" }] },
  { id: "b2", name: "Alamo Rentals Group", buyer_type: "landlord", contacts: [{ phone: "210-555-0142" }] },
  { id: "b3", name: "River City Capital", buyer_type: "cash", contacts: [{ phone: "210-555-0199" }] },
  { id: "b4", name: "Hill Country Flips", buyer_type: "flipper", contacts: [{ email: "offers@hillcountryflips.com" }] },
];

const properties: Property[] = [
  { id: "p1", addr1: "112 Blanco Rd", city: "San Antonio", state: "TX", zip: "78212", lat: 29.462, lon: -98.501 },
  { id: "p2", addr1: "2744 Briarhurst Dr #38", city: "Houston", state: "TX", zip: "77057", lat: 29.741, lon: -95.483 },
  { id: "p3", addr1: "501 Woodlawn Ave", city: "San Antonio", state: "TX", zip: "78201", lat: 29.458, lon: -98.514 },
  { id: "p4", addr1: "2803 W Martin St", city: "San Antonio", state: "TX", zip: "78207", lat: 29.422, lon: -98.514 },
  { id: "p5", addr1: "133 King William St", city: "San Antonio", state: "TX", zip: "78204", lat: 29.410, lon: -98.495 },
  { id: "p6", addr1: "845 S Presa St", city: "San Antonio", state: "TX", zip: "78210", lat: 29.411, lon: -98.487 },
];

const events: BuyerEvent[] = [
  { id: "e1", buyer_id: "b1", property_id: "p1", event_type: "purchase", event_date: "2025-07-21", price: 275000, source: "county" },
  { id: "e2", buyer_id: "b1", property_id: "p3", event_type: "purchase", event_date: "2025-05-10", price: 245000, source: "county" },
  { id: "e3", buyer_id: "b1", property_id: "p5", event_type: "purchase", event_date: "2024-12-19", price: 310000, source: "mls" },
  { id: "e4", buyer_id: "b2", property_id: "p4", event_type: "purchase", event_date: "2025-03-02", price: 190000, source: "county" },
  { id: "e5", buyer_id: "b2", property_id: "p6", event_type: "purchase", event_date: "2024-10-11", price: 215000, source: "county" },
  { id: "e6", buyer_id: "b3", property_id: "p1", event_type: "purchase", event_date: "2024-09-20", price: 260000, source: "county" },
  { id: "e7", buyer_id: "b4", property_id: "p6", event_type: "purchase", event_date: "2025-08-05", price: 330000, source: "mls" },
];

// ----------------------------- Helpers -------------------------------------

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function distanceMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8; // miles
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function circlePolygon(lon: number, lat: number, radiusMiles: number, points = 64) {
  const coords: [number, number][] = [];
  const R = 3958.8; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const latR = toRad(lat);
  const lonR = toRad(lon);
  const angDist = radiusMiles / R;
  for (let i = 0; i <= points; i++) {
    const brng = (i / points) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latR) * Math.cos(angDist) +
      Math.cos(latR) * Math.sin(angDist) * Math.cos(brng)
    );
    const lon2 =
      lonR +
      Math.atan2(
        Math.sin(brng) * Math.sin(angDist) * Math.cos(latR),
        Math.cos(angDist) - Math.sin(latR) * Math.sin(lat2)
      );
    coords.push([toDeg(lon2), toDeg(lat2)]);
  }
  return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [coords] }, properties: {} };
}

// -------------------------- Core computation -------------------------------

type ResultRow = { id: string; name: string; buyer_type: BuyerType; contacts: { phone?: string; email?: string }[]; deals_count: number; last_deal: Date; median_price: number };

function computeResults(center: { lat: number; lon: number }, radiusMiles: number, months: number, buyerType: BuyerType | "all"): ResultRow[] {
  const since = monthsAgo(months);
  const filtered = events.filter((e) => {
    const p = properties.find((pp) => pp.id === e.property_id)!;
    const withinTime = new Date(e.event_date) >= since;
    const withinDist = distanceMiles(center, { lat: p.lat, lon: p.lon }) <= radiusMiles;
    return e.event_type === "purchase" && withinTime && withinDist;
  });

  const byBuyer: Record<string, { buyer: Buyer; deals: BuyerEvent[]; last: Date }> = {};
  for (const ev of filtered) {
    const buyer = buyers.find((b) => b.id === ev.buyer_id)!;
    if (buyerType !== "all" && buyer.buyer_type !== buyerType) continue;
    if (!byBuyer[buyer.id]) byBuyer[buyer.id] = { buyer, deals: [], last: new Date("1970-01-01") };
    byBuyer[buyer.id].deals.push(ev);
    const d = new Date(ev.event_date);
    if (d > byBuyer[buyer.id].last) byBuyer[buyer.id].last = d;
  }

  const out = Object.values(byBuyer).map((v) => {
    const prices = v.deals.map((d) => d.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    return { id: v.buyer.id, name: v.buyer.name, buyer_type: v.buyer.buyer_type, contacts: v.buyer.contacts, deals_count: v.deals.length, last_deal: v.last, median_price: median } as ResultRow;
  });

  out.sort((a, b) => (b.deals_count - a.deals_count) || (b.last_deal.getTime() - a.last_deal.getTime()));
  return out;
}

// ------------------------------- UI ----------------------------------------

export default function App() {
  // Theme
  const [dark, setDark] = useState(false);
  const theme = dark
    ? { bg: "bg-[#0a0a0a]", card: "bg-[#111]", border: "border-[#1f1f1f]", text: "text-white", accent: "#ef4444", outline: "border border-gray-700" }
    : { bg: "bg-white", card: "bg-white", border: "border-gray-200", text: "text-gray-900", accent: "#ef4444", outline: "border border-gray-300" };

  // Default: San Antonio center
  const [center, setCenter] = useState({ lat: 29.4241, lon: -98.4936 });
  const [radius, setRadius] = useState(2); // miles
  const [months, setMonths] = useState(12);
  const [buyerType, setBuyerType] = useState<BuyerType | "all">("all");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const results = useMemo(() => computeResults(center, radius, months, buyerType), [center, radius, months, buyerType]);

  // Mapbox init
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
      center: [center.lon, center.lat],
      zoom: 11,
    });
    map.addControl(new mapboxgl.NavigationControl());

    // Click sets center
    map.on("click", (e) => setCenter({ lat: e.lngLat.lat, lon: e.lngLat.lng }));

    map.on("load", () => {
      map.addSource("buyers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "buyers", type: "circle", source: "buyers", paint: { "circle-radius": 6, "circle-stroke-width": 1.25, "circle-stroke-color": dark ? "#0a0a0a" : "#ffffff", "circle-color": ["match", ["get", "type"], "flipper", "#3b82f6", "landlord", "#22c55e", "#ef4444"] } });

      map.addSource("radius", { type: "geojson", data: circlePolygon(center.lon, center.lat, radius) });
      map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": theme.accent, "fill-opacity": 0.08 } });
      map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": theme.accent, "line-width": 2 } });
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  // Update style on theme change (re-add sources)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const style = dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
    map.setStyle(style);
    map.once("style.load", () => {
      map.addSource("buyers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "buyers", type: "circle", source: "buyers", paint: { "circle-radius": 6, "circle-stroke-width": 1.25, "circle-stroke-color": dark ? "#0a0a0a" : "#ffffff", "circle-color": ["match", ["get", "type"], "flipper", "#3b82f6", "landlord", "#22c55e", "#ef4444"] } });
      map.addSource("radius", { type: "geojson", data: circlePolygon(center.lon, center.lat, radius) });
      map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": theme.accent, "fill-opacity": 0.08 } });
      map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": theme.accent, "line-width": 2 } });
      updateMapData();
    });
  }, [dark]);

  // Push data to map whenever inputs change
  useEffect(() => { if (mapRef.current && mapRef.current.isStyleLoaded()) updateMapData(); }, [results, center, radius]);

  function updateMapData() {
    const map = mapRef.current!;
    const features = results.map((r) => {
      const lastDeal = events.filter((e) => e.buyer_id === r.id).sort((a, b) => +new Date(b.event_date) - +new Date(a.event_date))[0];
      const prop = properties.find((p) => p.id === lastDeal?.property_id);
      const coord: [number, number] = prop ? [prop.lon, prop.lat] : [center.lon, center.lat];
      return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: coord }, properties: { id: r.id, name: r.name, type: r.buyer_type } };
    });
    (map.getSource("buyers") as mapboxgl.GeoJSONSource)?.setData({ type: "FeatureCollection", features });
    (map.getSource("radius") as mapboxgl.GeoJSONSource)?.setData(circlePolygon(center.lon, center.lat, radius));
    map.flyTo({ center: [center.lon, center.lat], zoom: Math.max(map.getZoom(), 11), essential: true });
  }

  // ---------------------- Geocoding + Autocomplete -------------------------
  async function geocodeAndCenter(q: string) {
    try {
      if (!q.trim()) return;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxgl.accessToken}&limit=1&country=us`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocode failed (${res.status})`);
      const data = await res.json();
      const f = data?.features?.[0];
      if (!f) return;
      const [lon, lat] = f.center as [number, number];
      setCenter({ lat, lon });
      mapRef.current?.flyTo({ center: [lon, lat], zoom: 12 });
      setSuggestions([]);
      setQuery(f.place_name);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 3) { setSuggestions([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&limit=5&country=us`;
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) return; // silent fail
        const data = await res.json();
        setSuggestions(data?.features || []);
      } catch { /* ignore */ }
    }, 200);
    return () => { ctl.abort(); clearTimeout(t); };
  }, [query]);

  // ----------------------------- Tests -------------------------------------
  type TestResult = { name: string; passed: boolean; detail?: string };
  const testResults: TestResult[] = useMemo(() => {
    const out: TestResult[] = [];
    try {
      const r1 = computeResults(center, 2, 12, "all");
      out.push({ name: "T1: Default (2mi/12mo) returns >= 1 row", passed: r1.length >= 1, detail: `count:${r1.length}` });
      const r2 = computeResults(center, 10, 24, "flipper");
      out.push({ name: "T2: Flippers-only filter", passed: r2.every(x => x.buyer_type === "flipper"), detail: `count:${r2.length}` });
      const r3 = computeResults(center, 0.5, 12, "all");
      const r4 = computeResults(center, 5, 12, "all");
      out.push({ name: "T3: 0.5mi vs 5mi reduces results", passed: r3.length <= r4.length, detail: `${r3.length} <= ${r4.length}` });
      const r5 = computeResults(center, 5, 24, "all");
      const r6 = computeResults(center, 5, 12, "all");
      out.push({ name: "T4: 24mo returns at least as many as 12mo", passed: r5.length >= r6.length, detail: `${r5.length} >= ${r6.length}` });
      const r7 = computeResults(center, 10, 24, "landlord");
      out.push({ name: "T5: Landlords-only filter", passed: r7.every(x => x.buyer_type === "landlord"), detail: `count:${r7.length}` });
    } catch (err: any) {
      out.push({ name: "Tests crashed", passed: false, detail: String(err?.message || err) });
    }
    return out;
  }, [center, radius]);

  // ----------------------------- Render ------------------------------------
  return (
    <div className={`w-full h-full flex ${theme.bg} ${theme.text}`}>
      {/* Theme Toggle - bottom left */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2">
        <Button variant="secondary" className="rounded-xl border" onClick={() => setDark(d => !d)}>
          {dark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
          <span className="ml-2">{dark ? "Light" : "Dark"} Mode</span>
        </Button>
      </div>

      {/* Search bar with suggestions */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[840px] max-w-[95vw]">
        <div className="flex gap-3 items-start">
          {/* Search bar: button pinned to RIGHT side inside the white bar */}
          <div className={`relative flex-1 rounded-2xl shadow p-2 pl-4 border ${theme.card}`}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") geocodeAndCenter(query); }}
              placeholder="Search address"
              className={`pr-28 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm ${dark ? "bg-[#0f0f0f] text-white" : "bg-white"}`}
            />
            <Button
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-4"
              style={{ backgroundColor: theme.accent, color: '#fff' }}
              onClick={() => geocodeAndCenter(query)}
            >
              <Search className="h-4 w-4" />
              <span className="ml-2">Search</span>
            </Button>

            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div className={`absolute left-0 right-0 top-full mt-2 rounded-xl shadow-xl max-h-72 overflow-auto z-30 border ${theme.card}`}>
                {suggestions.map((s: any) => (
                  <button
                    key={s.id}
                    className={`w-full text-left px-4 py-2 text-sm hover:opacity-80 ${dark ? "text-white" : "text-gray-900"}`}
                    onClick={() => geocodeAndCenter(s.place_name)}
                  >
                    {s.place_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filters panel (Miles + Timeline) */}
          <div className={`rounded-2xl shadow border p-3 w-[320px] ${theme.card}`}>
            <div className="font-semibold mb-2">Search Filters</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs opacity-70">Miles
                <select
                  className={`mt-1 w-full rounded-lg border px-2 py-1 text-sm ${dark ? "bg-[#0f0f0f] text-white border-[#2a2a2a]" : "bg-white"}`}
                  value={radius}
                  onChange={(e) => setRadius(parseFloat(e.target.value))}
                >
                  {[1,2,3,5,10,15].map(r => <option key={r} value={r}>{r} mi</option>)}
                </select>
              </label>
              <label className="text-xs opacity-70">Timeline
                <select
                  className={`mt-1 w-full rounded-lg border px-2 py-1 text-sm ${dark ? "bg-[#0f0f0f] text-white border-[#2a2a2a]" : "bg-white"}`}
                  value={months}
                  onChange={(e) => setMonths(parseInt(e.target.value, 10))}
                >
                  <option value={12}>Last 12 mo</option>
                  <option value={24}>Last 24 mo</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Map container */}
      <div ref={mapNode} className="h-screen w-full" />

      {/* Sidebar results */}
      <div className={`w-[420px] h-screen border-l overflow-y-auto ${theme.card}`}>
        <div className={`p-3 border-b text-sm flex gap-2 items-center`}>
          <Badge
            variant="outline"
            className="capitalize"
            style={dark ? { backgroundColor: "#ffffff", color: "#000000", borderColor: "#e5e7eb" } : undefined}
          >
            {buyerType === "all" ? "All buyers" : buyerType}
          </Badge>
          <Badge variant="secondary">{radius} mi</Badge>
          <Badge variant="secondary">{months} mo</Badge>
        </div>

        {results.length === 0 && (
          <Card className={`m-3 ${theme.outline}`}>
            <CardContent className="p-4 text-sm opacity-80">No active buyers found. Try increasing the radius or time window.</CardContent>
          </Card>
        )}

        {results.map(r => (
          <Card key={r.id} className={`m-3 ${theme.outline} ${dark ? 'bg-[#111]' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span
                  style={
                    r.buyer_type === "flipper" ? { color: dark ? "#3b82f6" : "#1e3a8a" } : // blue
                    r.buyer_type === "landlord" ? { color: dark ? "#22c55e" : "#166534" } : // green
                    { color: dark ? "#ef4444" : "#111827" } // default
                  }
                >
                  {r.name}
                </span>
                <Badge
                  variant="outline"
                  className="capitalize"
                  style={
                    r.buyer_type === "flipper" ? { backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6" } :
                    r.buyer_type === "landlord" ? { backgroundColor: "#22c55e", color: "#fff", borderColor: "#22c55e" } :
                    dark ? { color: "#ef4444", borderColor: "#ef4444" } : undefined
                  }
                >
                  {r.buyer_type}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <Badge
                  variant="secondary"
                  style={
                    r.buyer_type === "flipper" ? { backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6" } :
                    r.buyer_type === "landlord" ? { backgroundColor: "#22c55e", color: "#fff", borderColor: "#22c55e" } :
                    dark ? { backgroundColor: "#ef4444", color: "#fff", borderColor: "#ef4444" } : undefined
                  }
                >
                  {r.deals_count} deals
                </Badge>
                <span className={dark ? "text-white" : "opacity-70"}> Last: {r.last_deal.toLocaleDateString()}</span>
              </div>
              <div className={dark ? "text-white" : "opacity-80"}>Median price: ${r.median_price.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}

        {/* Mini test results */}
        <Card className={`m-3 ${theme.outline} ${dark ? 'bg-[#111]' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {testResults.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                {t.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-500"/> : <XCircle className="h-4 w-4 text-red-500"/>}
                <span className={t.passed ? "" : "font-medium"}>{t.name}</span>
                <span className="opacity-60">{t.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

