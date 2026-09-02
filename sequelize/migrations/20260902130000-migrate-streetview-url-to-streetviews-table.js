import { Op } from 'sequelize';
import models from '../../src/models';
import { createInstance, destroyInstance } from '../../src/services/data-changes';

const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
};

// Location streetview_url values come in two shapes:
//  - a Google Maps pano share link:
//    .../maps/@?api=1&map_action=pano&viewpoint=LAT,LNG&fov=F&heading=H&pano=ID
//  - a Google Maps place/coordinate link with the pano data embedded in an
//    encoded thumbnail URL, e.g.
//    .../@LAT,LNG,3a,75y,14.82h,88.07t/data=...panoid=ID...pitch=P...yaw=Y...
const parseStreetviewUrl = (url) => {
  const result = {
    pano_id: null, lat: null, lng: null, heading: null, pitch: null, fov: null,
  };

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return result;
  }

  const pano = parsedUrl.searchParams.get('pano');
  if (pano) {
    result.pano_id = pano;

    const viewpoint = parsedUrl.searchParams.get('viewpoint');
    if (viewpoint) {
      const [lat, lng] = viewpoint.split(',').map(Number);
      if (Number.isFinite(lat)) result.lat = lat;
      if (Number.isFinite(lng)) result.lng = lng;
    }

    const heading = parseFloat(parsedUrl.searchParams.get('heading'));
    if (Number.isFinite(heading)) result.heading = heading;

    const fov = parseFloat(parsedUrl.searchParams.get('fov'));
    if (Number.isFinite(fov)) result.fov = Math.round(fov);
  } else {
    const decoded = safeDecodeURIComponent(url);

    const coordMatch = decoded.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/);
    if (coordMatch) {
      const [, lat, lng] = coordMatch;
      result.lat = parseFloat(lat);
      result.lng = parseFloat(lng);
    }

    const fovMatch = decoded.match(/@[^/]*,(\d+\.?\d*)y,/);
    if (fovMatch) {
      const [, fov] = fovMatch;
      result.fov = Math.round(parseFloat(fov));
    }

    const panoIdMatch = decoded.match(/panoid=([^&!]+)/) || decoded.match(/!1s([^!]+)!2e0/);
    if (panoIdMatch) {
      const [, panoId] = panoIdMatch;
      result.pano_id = panoId;
    }

    const yawMatch = decoded.match(/yaw=(-?\d+\.?\d*)/);
    const headingMatch = decoded.match(/@[^/]*,(-?\d+\.?\d*)h,/);
    if (yawMatch) {
      const [, yaw] = yawMatch;
      result.heading = parseFloat(yaw);
    } else if (headingMatch) {
      const [, heading] = headingMatch;
      result.heading = parseFloat(heading);
    }

    const pitchMatch = decoded.match(/pitch=(-?\d+\.?\d*)/);
    if (pitchMatch) {
      const [, pitch] = pitchMatch;
      result.pitch = parseFloat(pitch);
    }
  }

  if (result.heading != null && (result.heading < 0 || result.heading > 360)) {
    result.heading = null;
  }
  if (result.pitch != null && (result.pitch < -90 || result.pitch > 90)) {
    result.pitch = null;
  }
  if (result.fov != null && (result.fov < 10 || result.fov > 120)) {
    result.fov = null;
  }

  return result;
};

const migrateLocation = async (location) => {
  if (!location.streetview_url.trim()) {
    return;
  }

  const existing = await models.Streetview.findOne({
    where: { location_id: location.id },
  });
  if (existing) {
    return;
  }

  const parsed = parseStreetviewUrl(location.streetview_url);
  const hasAnyData = Object.values(parsed).some(value => value !== null);
  if (!hasAnyData) {
    return;
  }

  await createInstance(
    '<System>',
    models.Streetview.create.bind(models.Streetview),
    { location_id: location.id, ...parsed },
    { metadata: { source: 'migration' } },
  );
};

const revertStreetview = async (metadatum) => {
  const streetview = await models.Streetview.findByPk(metadatum.resource_id);
  if (streetview) {
    await destroyInstance('<System>', streetview, { metadata: { source: 'migration' } });
  }
};

module.exports = {
  parseStreetviewUrl,

  async up() {
    const locations = await models.Location.findAll({
      attributes: ['id', 'streetview_url'],
      where: { streetview_url: { [Op.ne]: null } },
    });

    for (const location of locations) {
      await migrateLocation(location);
    }
  },

  async down() {
    const createdMetadata = await models.Metadata.findAll({
      where: {
        resource_table: 'streetviews',
        source: 'migration',
        last_action_type: models.Metadata.actionTypes.create,
      },
    });

    for (const metadatum of createdMetadata) {
      await revertStreetview(metadatum);
    }
  },
};
