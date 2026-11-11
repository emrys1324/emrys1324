// Stand-in for the Google Maps JavaScript API (Map, AdvancedMarkerElement, Geocoder, Places autocomplete),
// served by the tests in place of maps.googleapis.com. Records calls in window.__gm.
(function () {
  const src = document.currentScript.src;
  const params = new URL(src).searchParams;
  const gm = (window.__gm = { url: src, calls: [], maps: [], markers: [] });
  const PX = 0.00005; // degrees per pixel
  const ll = (lat, lng) => ({ lat: () => lat, lng: () => lng, toJSON: () => ({ lat, lng }) });
  const lit = (p) => (typeof p.lat === "function" ? { lat: p.lat(), lng: p.lng() } : { lat: p.lat, lng: p.lng });
  const on = (obj) => {
    obj._l = {};
    obj.addListener = (ev, fn) => ((obj._l[ev] ||= []).push(fn), { remove() {} });
    obj._fire = (ev, arg) => (obj._l[ev] || []).forEach((f) => f(arg));
  };

  class Map {
    constructor(el, opts) {
      on(this);
      this.el = el;
      this.opts = opts;
      this.center = lit(opts.center);
      this.zoom = opts.zoom;
      el.style.background = "repeating-linear-gradient(45deg,#e8e2d6,#e8e2d6 10px,#f3efe7 10px,#f3efe7 20px)";
      el.style.position = "relative";
      el.dataset.mock = "google";
      el.addEventListener("click", (e) => {
        if (e.target.closest(".isla-pin")) return;
        const r = el.getBoundingClientRect();
        const lat = this.center.lat - (e.clientY - r.top - r.height / 2) * PX;
        const lng = this.center.lng + (e.clientX - r.left - r.width / 2) * PX;
        this._fire("click", { latLng: ll(lat, lng) });
      });
      gm.maps.push(this);
    }
    panTo(p) { this.center = lit(p); }
    setCenter(p) { this.center = lit(p); }
    getCenter() { return ll(this.center.lat, this.center.lng); }
    setZoom(z) { this.zoom = z; }
    getZoom() { return this.zoom; }
  }

  class AdvancedMarkerElement {
    constructor(o) {
      on(this);
      this._pos = lit(o.position);
      this.content = o.content;
      this.gmpDraggable = o.gmpDraggable;
      this.title = o.title;
      this.map = o.map;
      gm.markers.push(this);
    }
    get position() { return this._pos; }
    set position(p) { this._pos = lit(p); }
    get map() { return this._map; }
    set map(m) {
      this._map = m;
      if (m) m.el.appendChild(this.content);
      else this.content.remove();
    }
  }
  gm.drag = (lat, lng) => {
    const m = gm.markers.filter((m) => m.map && m.gmpDraggable).at(-1);
    m._pos = { lat, lng };
    m._fire("dragend");
  };

  const comp = (name, types) => ({ long_name: name, short_name: name, longText: name, shortText: name, types });
  const BARANGAYS = { Carmen: [12.58, 122.14], Poblacion: [12.569, 122.132] };
  class Geocoder {
    async geocode(req) {
      gm.calls.push({ fn: "geocode", req: JSON.parse(JSON.stringify(req)) });
      if (req.address) {
        const name = Object.keys(BARANGAYS).find((b) => req.address.startsWith(b + ","));
        return { results: name ? [{ types: ["sublocality"], geometry: { location: ll(...BARANGAYS[name]) }, address_components: [], formatted_address: req.address }] : [] };
      }
      return {
        results: [
          { types: ["plus_code"], formatted_address: "H4C2+X2 San Agustin", address_components: [comp("H4C2+X2", ["plus_code"])] },
          {
            types: ["street_address"],
            formatted_address: "Rizal Street, Poblacion, San Agustin, Romblon",
            address_components: [comp("Rizal Street", ["route"]), comp("Poblacion", ["sublocality_level_1", "sublocality", "political"]), comp("San Agustin", ["locality", "political"]), comp("Romblon", ["administrative_area_level_2", "political"])],
          },
          { types: ["point_of_interest", "establishment"], formatted_address: "San Agustin Parish Church, San Agustin", address_components: [comp("San Agustin Parish Church", ["point_of_interest", "establishment"])] },
        ],
      };
    }
  }

  const PLACES = {
    p1: { main: "Mabini Street", secondary: "Carmen, San Agustin, Romblon", loc: [12.5811, 122.1411], types: ["route"], comps: [comp("Mabini Street", ["route"]), comp("Carmen", ["sublocality_level_1", "sublocality", "political"]), comp("San Agustin", ["locality", "political"])] },
    p2: { main: "Mabini Elementary School", secondary: "Mabini Street, Carmen, San Agustin", loc: [12.5822, 122.1422], types: ["school", "point_of_interest", "establishment"], comps: [comp("Mabini Street", ["route"]), comp("Carmen", ["sublocality_level_1", "sublocality", "political"]), comp("San Agustin", ["locality", "political"])] },
  };
  const txt = (s) => ({ text: s, toString: () => s });
  class Place {
    constructor(id) { this.id = id; }
    async fetchFields({ fields }) {
      gm.calls.push({ fn: "fetchFields", id: this.id, fields });
      const p = PLACES[this.id];
      Object.assign(this, { location: ll(...p.loc), displayName: p.main, formattedAddress: `${p.main}, ${p.secondary}`, addressComponents: p.comps, types: p.types });
      return { place: this };
    }
  }
  let tokens = 0;
  class AutocompleteSessionToken { constructor() { this.n = ++tokens; } }
  const AutocompleteSuggestion = {
    async fetchAutocompleteSuggestions(req) {
      gm.calls.push({ fn: "suggest", input: req.input, token: req.sessionToken?.n, regions: req.includedRegionCodes, bias: req.locationBias });
      if (!req.input.toLowerCase().includes("mab")) return { suggestions: [] };
      return {
        suggestions: Object.entries(PLACES).map(([id, p]) => ({
          placePrediction: { placeId: id, text: txt(`${p.main}, ${p.secondary}`), mainText: txt(p.main), secondaryText: txt(p.secondary), toPlace: () => new Place(id) },
        })),
      };
    },
  };

  window.google = { maps: { Map, Geocoder, marker: { AdvancedMarkerElement }, places: { AutocompleteSuggestion, AutocompleteSessionToken } } };
  if (window.__gmMockAuthFail) setTimeout(() => window.gm_authFailure && window.gm_authFailure(), 50);
  setTimeout(() => window[params.get("callback")](), 10);
})();
