import models from '../models';
import {
  getMetadataForLocation,
  getMetadataForService,
  getLastValidatedDateForLocation,
} from './last-updates';
import { NotFoundError } from '../utils/errors';

const isLocationClosed = (occasion, eventRelatedInfos, services) => {
  if (!occasion) {
    return false;
  }
  const hasCOVIDEventRelatedInfo = eventRelatedInfos
    && eventRelatedInfos.some(eventRelatedInfo => eventRelatedInfo.event === occasion);
  return hasCOVIDEventRelatedInfo;
};

const locationAssociations = {
  include: [
    {
      model: models.Organization,
      include: [models.Phone],
    },
    models.Phone,
    models.PhysicalAddress,
    models.AccessibilityForDisabilities,
    models.EventRelatedInfo,
  ],
};

const serviceAssociations = {
  include: [
    {
      model: models.Eligibility,
      include: [models.EligibilityParameter],
    },
    {
      model: models.ServiceTaxonomySpecificAttribute,
      include: [{ model: models.TaxonomySpecificAttribute, as: 'attribute' }],
    },
    {
      model: models.Taxonomy,
      through: { attributes: [] },
    },
    models.RegularSchedule,
    models.HolidaySchedule,
    {
      model: models.Language,
      through: { attributes: [] },
    },
    models.RequiredDocument,
    models.DocumentsInfo,
    models.Phone,
    models.EventRelatedInfo,
    models.ServiceArea,
  ],
};

const getNeighborhoodAttributeSubquery = {
  attributes: {
    include: [
      [
        models.sequelize.literal(`(
            SELECT neighborhood
            FROM nyc_neighborhood_geometries
            WHERE ST_Contains(
              nyc_neighborhood_geometries.geometry,
              ST_SetSRID(position,4326)
            )
        )`),
        'neighborhood',
      ],
    ],
  },
};

async function buildLocationResponse(location, locationWithServices, excludeMetadata) {
  const {
    PhysicalAddresses: addresses,
    additional_info: additionalInfo,
    ...unchangedProps
  } = location.get({ plain: true });

  const services = locationWithServices && locationWithServices.Services
    ? locationWithServices.Services.map(s => s.get({ plain: true }))
    : [];

  if (!addresses || addresses.length !== 1) {
    throw new Error('Location does not have a valid address');
  }

  const address = addresses[0];

  const responseData = {
    ...unchangedProps,
    additionalInfo,
    address: {
      street: address.address_1,
      city: address.city,
      region: address.region,
      state: address.state_province,
      postalCode: address.postal_code,
      country: address.country,
      neighborhood: address.neighborhood,
    },
  };

  const { EventRelatedInfos } = location;
  const closed = isLocationClosed('COVID19', EventRelatedInfos, services);

  if (excludeMetadata) {
    const [{ lastValidatedDateForLocation }] = await getLastValidatedDateForLocation(location.id);
    return {
      ...responseData,
      Services: services,
      lastValidatedDateForLocation,
      closed,
    };
  }

  const locationMetadata = await getMetadataForLocation(location, address);
  const servicesWithMetadata = await Promise.all(services.map(async service => ({
    ...service,
    metadata: await getMetadataForService(service),
  })));

  return {
    ...responseData,
    Services: servicesWithMetadata,
    metadata: locationMetadata,
    closed,
  };
}

async function buildLocationGetInfoResponse(locationId) {
  const [location, locationWithServices] = await Promise.all([
    models.Location.findByPk(
      locationId,
      {
        include: locationAssociations.include,
        attributes: getNeighborhoodAttributeSubquery.attributes,
      },
    ),
    models.Location.findByPk(
      locationId,
      {
        include: [{
          model: models.Service,
          through: { attributes: [] },
          include: serviceAssociations.include,
        }],
        attributes: ['id'],
      },
    ),
  ]);

  if (!location) {
    throw new NotFoundError('Location not found');
  }

  return buildLocationResponse(location, locationWithServices, false);
}

function parseWebsiteDataRow(websiteData) {
  if (!websiteData) {
    return null;
  }

  return JSON.parse(websiteData.data);
}

export async function upsertWebsiteDataForLocation(locationId) {
  const getInfoResponse = await buildLocationGetInfoResponse(locationId);
  const now = new Date();

  const existingWebsiteData = await models.WebsiteData.findOne({
    where: { location_id: locationId },
  });

  const updateData = {
    slug: getInfoResponse.slug,
    data: JSON.stringify(getInfoResponse),
    updated_at: now,
    location_id: locationId,
  };

  if (existingWebsiteData) {
    await existingWebsiteData.update(updateData);
  } else {
    await models.WebsiteData.create(updateData);
  }

  return getInfoResponse;
}

export async function getWebsiteDataByLocationId(locationId) {
  const websiteData = await models.WebsiteData.findOne({
    where: { location_id: locationId },
  });

  if (websiteData) {
    return parseWebsiteDataRow(websiteData);
  }

  return upsertWebsiteDataForLocation(locationId);
}

export async function getWebsiteDataBySlug(slug) {
  const slugLeafExpression = [
    'split_part(slug, \'/\',',
    'array_length(string_to_array(slug, \'/\'), 1))',
  ].join(' ');
  const websiteData = await models.WebsiteData.findOne({
    where: models.sequelize.where(
      models.sequelize.literal(slugLeafExpression),
      slug,
    ),
  });

  if (websiteData) {
    return parseWebsiteDataRow(websiteData);
  }

  const location = await models.Location.findOne({ where: { slug } });
  if (!location) {
    return null;
  }

  return upsertWebsiteDataForLocation(location.id);
}

export async function upsertWebsiteDataForService(serviceId) {
  const service = await models.Service.findByPk(serviceId, {
    include: [{
      model: models.Location,
      through: { attributes: [] },
      attributes: ['id'],
    }],
  });

  if (!service || !service.Locations) {
    return;
  }

  await Promise.all(service.Locations.map(location => upsertWebsiteDataForLocation(location.id)));
}
