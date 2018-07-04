import Joi from 'joi';
import PromisePool from 'es6-promise-pool';
import locationSchemas from './validation/locations';
import models from '../models';
import { updateInstance, createInstance, destroyInstance } from '../services/data-changes';
import { getMetadataForLocation, getMetadataForService } from '../services/last-updates';
import geometry from '../utils/geometry';
import { NotFoundError } from '../utils/errors';
import dataJson from '../../parsed_data.json';
import dhsJson from '../../parsed_facilities.json';

export default {
  find: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.find, { allowUnknown: true });

      const {
        latitude,
        longitude,
        radius,
        searchString,
        taxonomyId,
      } = req.query;

      const position = geometry.createPoint(longitude, latitude);

      const filterParameters = {};
      if (searchString) {
        filterParameters.searchString = searchString.trim();
      }
      if (taxonomyId) {
        filterParameters.taxonomyId = taxonomyId.trim();
      }

      const locations = await models.Location.findAllInArea(position, radius, filterParameters);
      res.send(locations);
    } catch (err) {
      next(err);
    }
  },

  getInfo: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.getInfo, { allowUnknown: true });

      const location = await models.Location.findById(
        req.params.locationId,
        {
          include: [
            {
              model: models.Service,
              include: [
                models.Taxonomy,
                models.RegularSchedule,
                models.Language,
                models.RequiredDocument,
                models.DocumentsInfo,
              ],
            },
            models.Comment,
            models.Organization,
            models.Phone,
            models.PhysicalAddress,
          ],
        },
      );

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const {
        PhysicalAddresses: addresses,
        Services: services,
        additional_info: additionalInfo,
        ...unchangedProps
      } = location.get({ plain: true });

      if (!addresses || addresses.length !== 1) {
        throw new Error('Location does not have a valid address');
      }

      const address = addresses[0];

      const locationMetadata = await getMetadataForLocation(location, address);
      const servicesWithMetadata = await Promise.all(services.map(async service => ({
        ...service,
        metadata: await getMetadataForService(service),
      })));

      const responseData = {
        ...unchangedProps,
        Services: servicesWithMetadata,
        additionalInfo,
        address: {
          street: address.address_1,
          city: address.city,
          region: address.region,
          state: address.state_province,
          postalCode: address.postal_code,
          country: address.country,
        },
        metadata: locationMetadata,
      };

      res.send(responseData);
    } catch (err) {
      next(err);
    }
  },

  create: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.create, { allowUnknown: true });

      const {
        name,
        description,
        latitude,
        longitude,
        organizationId,
        address,
        additionalInfo,
      } = req.body;
      const position = geometry.createPoint(longitude, latitude);

      const organization = await models.Organization.findById(organizationId);
      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const LocationCreateFunction = organization.createLocation.bind(organization);
      const createdLocation = await createInstance(req.user, LocationCreateFunction, {
        name,
        description,
        position,
        additional_info: additionalInfo,
      });

      const addressCreateFunction = createdLocation.createPhysicalAddress.bind(createdLocation);
      await createInstance(req.user, addressCreateFunction, {
        address_1: address.street,
        city: address.city,
        region: address.region,
        state_province: address.state,
        postal_code: address.postalCode,
        country: address.country,
      });

      res.status(201).send(createdLocation);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    const updateLocation = (location, updateParams) => {
      const locationUpdate = {};
      if (updateParams.name != null) { locationUpdate.name = updateParams.name; }
      if (updateParams.description != null) {
        locationUpdate.description = updateParams.description;
      }
      if (updateParams.additionalInfo != null) {
        locationUpdate.additional_info = updateParams.additionalInfo;
      }
      if (updateParams.latitude != null && updateParams.longitude != null) {
        const { longitude, latitude } = updateParams;
        locationUpdate.position = geometry.createPoint(longitude, latitude);
      }
      if (updateParams.organizationId != null) {
        locationUpdate.organization_id = updateParams.organizationId;
      }

      return updateInstance(req.user, location, locationUpdate);
    };

    const updateAddress = (location, updateParams) => {
      if (!location.PhysicalAddresses || location.PhysicalAddresses.length !== 1) {
        throw new Error('Trying to update address for location with no valid existing address');
      }

      const currentAddress = location.PhysicalAddresses[0];

      const addressUpdate = {};
      if (updateParams.street != null) { addressUpdate.address_1 = updateParams.street; }
      if (updateParams.city != null) { addressUpdate.city = updateParams.city; }
      if (updateParams.region != null) { addressUpdate.region = updateParams.region; }
      if (updateParams.state != null) { addressUpdate.state_province = updateParams.state; }
      if (updateParams.postalCode != null) { addressUpdate.postal_code = updateParams.postalCode; }
      if (updateParams.country != null) { addressUpdate.country = updateParams.country; }

      return updateInstance(req.user, currentAddress, addressUpdate);
    };

    try {
      await Joi.validate(req, locationSchemas.update, { allowUnknown: true });

      const { locationId } = req.params;

      const location = await models.Location.findById(locationId, {
        include: models.PhysicalAddress,
      });

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const updatePromises = [];

      if (req.body.address) {
        updatePromises.push(updateAddress(location, req.body.address));
      }

      updatePromises.push(updateLocation(location, req.body));

      await Promise.all(updatePromises);

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  addPhone: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.addPhone, { allowUnknown: true });

      const { locationId } = req.params;

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const {
        number,
        extension,
        type,
        language,
        description,
      } = req.body;

      const createdPhone = await createInstance(req.user, location.createPhone.bind(location), {
        number,
        extension,
        type,
        language,
        description,
      });

      res.status(201).send(createdPhone);
    } catch (err) {
      next(err);
    }
  },

  updatePhone: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.updatePhone, { allowUnknown: true });

      const { phoneId } = req.params;

      const phone = await models.Phone.findById(phoneId);
      if (!phone) {
        throw new NotFoundError('Phone not found');
      }

      const editableFields = ['number', 'extension', 'type', 'language', 'description'];
      await updateInstance(req.user, phone, req.body, { fields: editableFields });

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  deletePhone: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.deletePhone, { allowUnknown: true });

      const { phoneId } = req.params;

      const phone = await models.Phone.findById(phoneId);
      if (!phone) {
        throw new NotFoundError('Phone not found');
      }

      await destroyInstance(req.user, phone);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  addComment: async (req, res, next) => {
    try {
      const { locationId } = req.params;
      const { content, postedBy } = req.body;

      await Joi.validate(req, locationSchemas.addComment, { allowUnknown: true });

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      await createInstance(req.user, location.createComment.bind(location), {
        content,
        posted_by: postedBy,
      });
      res.sendStatus(201);
    } catch (err) {
      next(err);
    }
  },

  suggestNew: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.suggestNew, { allowUnknown: true });

      const {
        name,
        latitude,
        longitude,
        taxonomyIds,
      } = req.body;

      const modelCreateFunction = models.LocationSuggestion.create.bind(models.LocationSuggestion);
      await createInstance(req.user, modelCreateFunction, {
        name,
        position: geometry.createPoint(longitude, latitude),
        taxonomy_ids: taxonomyIds,
      });
      res.sendStatus(201);
    } catch (err) {
      next(err);
    }
  },

  loadData: async (req, res, next) => {
    // return res.json(dataJson);

    const country = 'US';

    const createCategory = async category => models.Taxonomy.create({ name: category.name });

    const createSubcategory = async (subcategory, categoryObject) => models.Taxonomy.create({
      name: subcategory.name,
      parent_id: categoryObject.id,
      parent_name: categoryObject.name,
    });

    const handleLocation = async (location, organizationObject) => {
      const locationObject = await models.Location.create({
        name: location.name,
        organization_id: organizationObject.id,
      });

      // TODO: Distinguish PhysicalAddress from PostalAddress, based on "type" field.
      const { address } = location;
      await models.PhysicalAddress.create({
        address_1: address.street_address,
        city: address.city,
        state_province: address.state,
        postal_code: address.zipcode,
        country,
        location_id: locationObject.id,
      });

      if (location.phone_number) {
        await models.Phone.create({
          number: location.phone_number.number,
          location_id: locationObject.id,
        });
      }

      return locationObject;
    };

    const handleOrganization = async (organization, taxonomyObject) => {
      // TODO: In all these places, use the Sequelize methods for adding/setting associated data.
      const organizationObject = await models.Organization.create({
        name: organization.name,
        description: organization.description,
        url: organization.url,
      });

      await Promise.all(organization.phone_numbers.map(async phoneNumber =>
        models.Phone.create({
          number: phoneNumber.number,
          organization_id: organizationObject.id,
        })));

      const locationObjects = await Promise.all(organization.locations.map(async location =>
        handleLocation(location, organizationObject)));

      const serviceObject = await models.Service.create({
        name: taxonomyObject.name,
        organization_id: organizationObject.id,
      });

      await serviceObject.addTaxonomy(taxonomyObject);

      await Promise.all(locationObjects.map(async locationObject =>
        locationObject.addService(serviceObject)));
    };

    try {
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < dataJson.length; i += 1) {
        const category = dataJson[i];

        const categoryObject = await createCategory(category);

        await Promise.all(category.subcategories.map(async (subcategory) => {
          const subcategoryObject = await createSubcategory(subcategory, categoryObject);
          await Promise.all(subcategory.organizations.map(async organization =>
            handleOrganization(organization, subcategoryObject)));
        }));

        await Promise.all(category.organizations.map(async organization =>
          handleOrganization(organization, categoryObject)));
      }
      /* eslint-enable no-await-in-loop */
    } catch (err) {
      next(err);
    }

    res.status(200).end();
  },

  loadDhsData: async (req, res, next) => {
    // return res.json(dhsJson);

    const country = 'US';
    const state = 'NY';

    const nearbyRadius = 30;
    const newLocationNearExisting = [
      'Murray Hill Neighborhood Assocation',
      'Department of Probation Bronx Office',
      'Harlem Dowling West Side Center !st Floor',
      'Word of Life Christian Fellowship International FP',
      'Department of Probation Manhattan Office',
      'Christ Temple of the Apostolic Faith',
      'Shiloh Church of Christ',
      'Come World Ministries, Inc.',
      'Spanish SDA Church',
      'In The Beginning Outreach, Inc.',
      'Gospel Assembly Food Pantry',
      'Caribbean American Steelpan Assciation',
      'Maranatha SDA Church',
      'Vets Inc Locust Manor Senior Residence',
      'Calvary Baptist Church',
      'Iglesia Pentecostal El Maestro Inc.',
      'Scan-LA Guardia Memorial',
    ];

    const deg2rad = deg => deg * (Math.PI / 180);
    const getDistance = (position1, position2) => {
      const [lng1, lat1] = position1.coordinates;
      const [lng2, lat2] = position2.coordinates;
      const R = 6371; // Radius of the earth in km
      const dLat = deg2rad(lat2 - lat1);
      const dLon = deg2rad(lng2 - lng1);
      const a =
        (Math.sin(dLat / 2) * Math.sin(dLat / 2)) +
        (Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        (Math.sin(dLon / 2) * Math.sin(dLon / 2)));
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const d = R * c; // Distance in km
      return Math.round(d * 1000);
    };

    const createOrganization = organizationName => models.Organization.create({
      name: organizationName,
    });

    const createLocation = async (organizationObject, locationInfo) => {
      const {
        locationName,
        street,
        city,
        zipcode,
        position,
      } = locationInfo;

      const locationObject = await models.Location.create({
        name: locationName !== organizationObject.name ? locationName : null,
        organization_id: organizationObject.id,
        position,
      });

      await models.PhysicalAddress.create({
        address_1: street,
        city,
        state_province: state,
        postal_code: zipcode,
        country,
        location_id: locationObject.id,
      });

      return locationObject;
    };

    const createService = async (organizationObject, locationObject, taxonomyObject) => {
      const serviceObject = await models.Service.create({
        name: taxonomyObject.name,
        organization_id: organizationObject.id,
      });

      await Promise.all([
        locationObject.addService(serviceObject),
        serviceObject.addTaxonomy(taxonomyObject),
      ]);

      return serviceObject;
    };

    const getDuplicateLocations = async (position, locationName, organizationName) => {
      // There's a potential race condition here, if 2 duplicate locations are added in parallel,
      // but hopefully that's unlikely enough not to be a real problem.
      const potentialDuplicates = await models.Location.findAllInArea(position, nearbyRadius, {});
      const duplicatesWithSameOrgName = potentialDuplicates.filter(potentialDuplicate =>
        potentialDuplicate.Organization.name === organizationName);

      if (newLocationNearExisting.indexOf(locationName) !== -1
        && !duplicatesWithSameOrgName.length) {
        return [];
      }

      return potentialDuplicates;
    };

    const findTaxonomy = async name => models.Taxonomy.findOne({ where: { name } });
    const taxonomyMapping = {
      'Food Pantry': await findTaxonomy('Food Pantry'),
      'Soup Kitchen': await findTaxonomy('Soup kitchen'),
    };

    const handleLocation = async (location) => {
      const {
        subcategory,
        'location name': locationName,
        'street address': rawStreet,
        city,
        zipcode,
        latitude,
        longitude,
        'organization name': organizationName,
      } = location;
      const position = geometry.createPoint(longitude, latitude);

      const taxonomyObject = taxonomyMapping[subcategory];
      if (!taxonomyObject) {
        // For now, let's ignore the facilities with unsupported categories.
        return;
      }

      const nearbyLocations = await getDuplicateLocations(position, locationName, organizationName);
      const locationsStr = nearbyLocations
        .map(nearbyLocation =>
          `${nearbyLocation.Organization.name} ${getDistance(position, nearbyLocation.position)}m`)
        .join(', ');
      if (nearbyLocations.length) {
        // eslint-disable-next-line no-console
        console.log(`Duplicate locations found for ${locationName}: ${locationsStr}`);
        return;
      }

      let street = rawStreet;
      if (street.indexOf('\n') !== -1) { [street] = street.split('\n'); }
      if (street.indexOf('  ') !== -1) { street = street.replace(/  +/g, ' '); }

      const organizationObject = await createOrganization(organizationName);
      const locationObject = await createLocation(organizationObject, {
        locationName,
        street,
        city,
        zipcode,
        position,
      });

      await createService(organizationObject, locationObject, taxonomyObject);
    };

    let i = 0;

    const promiseProducer = () => {
      if (i < dhsJson.length) {
        const location = dhsJson[i];
        i += 1;
        return handleLocation(location);
      }
      return null;
    };

    const concurrentLocationsHandled = 20;
    const promisePool = new PromisePool(promiseProducer, concurrentLocationsHandled);

    try {
      await promisePool.start();
    } catch (err) {
      next(err);
    }

    res.status(200).end();
  },
};
