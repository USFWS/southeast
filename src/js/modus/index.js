const xhr = require('xhr');
const L = require('leaflet');
require('leaflet.markerCluster');
require('leaflet.featuregroup.subgroup');
require('leaflet.defaultextent');
const parallel = require('async/parallel');
const randomColor = require('randomcolor');

const layers = require('./layers');
const icons = require('./icons');

let hasWWW = window.location.href.indexOf('www');
hasWWW = !(hasWWW < 0);
const baseURL = document.body.getAttribute('data-root');
const dataURL = hasWWW ? baseURL : baseURL.replace('www.', '');

const towerUrl = `${dataURL}data/modus-towers.js`;
const detectionsUrl = `${dataURL}data/modus-detections.js`;

const clusterGroup = L.layerGroup();

L.Icon.Default.imagePath = `${dataURL}images/`;

const unique = arrArg => arrArg.filter((elem, pos, arr) => arr.indexOf(elem) === pos);

const homeIcon = '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="26px" height="26px" viewBox="0 0 26 26" enable-background="new 0 0 26 26" xml:space="preserve"><g id="home"><polygon fill="#464646" points="11.2,20.65 11.2,15.249 14.8,15.249 14.8,20.65 19.3,20.65 19.3,13.45 22,13.45 13,5.35 4,13.45 6.7,13.45 6.7,20.65"/></g></svg>';

const createDetectionTemplate = props => `
  <div><strong>${props.spp}</strong><br>${props.site}</div>
  <div>Tagged on: ${props.tag_date}</div>
  <div>Detected on: ${props.dates}</div>
`;

const onEachFeature = (feat, layer) => {
  const props = feat.properties;
  const type = props.spp ? 'detection' : 'tower';
  switch (type) {
    case 'tower':
      layer.bindPopup(props.site);
      break;
    case 'detection':
      layer.bindPopup(createDetectionTemplate(props));
      break;
    default:
      break;
  }
};

const createGeoJsonLayer = (geojson, site, colors) => {
  const color = colors.pop();
  const cluster = L.markerClusterGroup({
    maxClusterRadius: 25,
    iconCreateFunction: cluster => icons.createClusterIcon(cluster, color)
  });
  const layer = L.geoJSON(geojson, {
    filter(feat, layer) {
      return feat.properties.site === site;
    },
    pointToLayer(feat, layer) {
      return pointToLayer(feat, layer, color);
    },
    onEachFeature
  });
  return cluster.addLayer(layer);
};

const createMap = (err, data) => {
  if (err) console.error(err);

  // Get a list of tower sites, generate random colors
  const sites = unique(data.detections.features.map(d => d.properties.site));
  const colors = randomColor({ count: sites.length });
  const towerColors = [...colors];
  const detectionLayers = sites.map(site => createGeoJsonLayer(data.detections, site, colors));

  // Create a layer for Towers
  const towers = L.geoJSON(data.towers, {
    pointToLayer(feat, latlng) {
      return L.marker(latlng, {
        icon: icons.getTowerIcon(towerColors.pop())
      });
    },
    onEachFeature
  });

  // Generate an overlays object by combining array of sites and detections; include towers layer first
  const overlays = sites.reduce(
    (acc, val, i) => {
      acc[val] = detectionLayers[i];
      return acc;
    },
    { Towers: towers }
  );

  const map = L.map('map', {
    layers: [layers.esriNatGeo, towers]
  });

  L.control
    .layers(
      { 'National Geographic': layers.esriNatGeo, Imagery: layers.esriImagery },
      overlays,
      {
        collapsed: false
      }
    )
    .addTo(map);

  map.fitBounds(L.geoJSON(data.detections).getBounds());

  L.control
    .defaultExtent()
    .addTo(map)
    .setCenter(map.getCenter())
    .setZoom(map.getZoom());

  document.querySelector(
    '.leaflet-control-defaultextent-toggle'
  ).innerHTML = homeIcon;
};

const pointToLayer = (feat, latlng, color) => {
  const type = feat.properties.spp ? 'detection' : 'tower';

  switch (type) {
    case 'tower':
      return L.marker(latlng, { icon: icons.getTowerIcon(color) });
    default:
      return L.marker(latlng, { icon: icons.getCircleIcon(color) });
  }
};

const getData = (url, cb) => {
  xhr.get(url, (err, res, body) => {
    if (err) return cb(err);
    return cb(null, JSON.parse(body));
  });
};

parallel(
  {
    towers: getData.bind(null, towerUrl),
    detections: getData.bind(null, detectionsUrl)
  },
  createMap
);
