const map = L.map("map").setView([51.2538, -85.3232], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
}).addTo(map);

let coffeeData = [];
const markersLayer = L.layerGroup().addTo(map);
let bufferCircle = null;

function clearBuffer() {
  if (bufferCircle) {
    map.removeLayer(bufferCircle);
    bufferCircle = null;
  }
}

function distanceKm(latlng1, latlng2) {
  return latlng1.distanceTo(latlng2) / 1000;
}

function showLocations(data) {
  markersLayer.clearLayers();
  const tbody = document.querySelector("#coffeeTable tbody");
  tbody.innerHTML = "";

  data.forEach((point) => {
    const marker = L.marker([point.lat, point.lon])
      .bindPopup(`${point.brand}: ${point.name}`);
    markersLayer.addLayer(marker);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${point.brand}</td>
      <td>${point.name}</td>
      <td>${point.address}</td>
      <td>${point.lat.toFixed(5)}</td>
      <td>${point.lon.toFixed(5)}</td>
      <td>${point.distance ? point.distance.toFixed(2) : ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function fetchBrandLocations(brand, retries = 3) {
  const query = `
    [out:json][timeout:25];
    area["name"="Ontario"]["admin_level"=4]->.searchArea;
    (
      node["brand"="${brand}"](area.searchArea);
      way["brand"="${brand}"](area.searchArea);
      relation["brand"="${brand}"](area.searchArea);
    );
    out center;
  `;
  const overpassUrl =
    "https://lz4.overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  try {
    const res = await fetch(overpassUrl);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();

    return data.elements
      .map((e) => {
        let lat = e.lat || (e.center && e.center.lat);
        let lon = e.lon || (e.center && e.center.lon);
        if (!lat || !lon) return null;

        let tags = e.tags || {};
        let addressParts = [];
        if (tags["addr:housenumber"]) addressParts.push(tags["addr:housenumber"]);
        if (tags["addr:street"]) addressParts.push(tags["addr:street"]);
        if (tags["addr:city"]) addressParts.push(tags["addr:city"]);
        if (tags["addr:postcode"]) addressParts.push(tags["addr:postcode"]);

        let address = addressParts.length > 0 ? addressParts.join(", ") : "Address not available";

        return {
          id: e.id,
          brand,
          name: tags.name || brand,
          lat,
          lon,
          address,
        };
      })
      .filter((x) => x !== null);
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying fetch for ${brand}, attempts left: ${retries}`);
      await new Promise((res) => setTimeout(res, 2000));
      return fetchBrandLocations(brand, retries - 1);
    }
    alert(`Failed to load ${brand} data from Overpass API.`);
    console.error(error);
    return [];
  }
}

document.getElementById("brandForm").addEventListener("submit", async (evt) => {
  evt.preventDefault();

  clearBuffer();
  markersLayer.clearLayers();
  document.querySelector("#coffeeTable tbody").innerHTML = "";

  const formData = new FormData(evt.target);
  const selectedBrands = formData.getAll("brand");

  if (selectedBrands.length === 0) {
    alert("Please select at least one brand.");
    return;
  }

  const findMeBtn = document.getElementById("findMe");
  findMeBtn.disabled = true;

  coffeeData = [];
  for (const brand of selectedBrands) {
    const locations = await fetchBrandLocations(brand);
    coffeeData = coffeeData.concat(locations);
  }

  showLocations(coffeeData);
  findMeBtn.disabled = false;
});

document.getElementById("findMe").addEventListener("click", () => {
  clearBuffer();
  map.locate({ setView: true, maxZoom: 13 });
});

map.on("locationfound", function (e) {
  const userLoc = e.latlng;
  clearBuffer();

  bufferCircle = L.circle(userLoc, {
    radius: 15000,
    color: "blue",
    fill: false,
  }).addTo(map);

  let filtered = coffeeData
    .map((s) => {
      let dist = distanceKm(userLoc, L.latLng(s.lat, s.lon));
      return { ...s, distance: dist };
    })
    .filter((s) => s.distance <= 15);

  filtered.sort((a, b) => a.distance - b.distance);

  markersLayer.clearLayers();
  const tbody = document.querySelector("#coffeeTable tbody");
  tbody.innerHTML = "";

  filtered.forEach((point) => {
    const marker = L.marker([point.lat, point.lon]).bindPopup(
      `${point.brand}: ${point.name}<br>Distance: ${point.distance.toFixed(2)} km`
    );
    markersLayer.addLayer(marker);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${point.brand}</td>
      <td>${point.name}</td>
      <td>${point.address}</td>
      <td>${point.lat.toFixed(5)}</td>
      <td>${point.lon.toFixed(5)}</td>
      <td>${point.distance.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (filtered.length === 0) alert("No locations found within 15 km.");
});

map.on("locationerror", function () {
  alert("Could not get your location. Please allow location access.");
});
