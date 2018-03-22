import Joi from 'joi';
import locationSchemas from './validation/locations';
import models from '../models';
import geometry from '../utils/geometry';
import { NotFoundError } from '../utils/errors';
import dataJson from '../../parsed_data.json';

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

  suggestNew: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.suggestNew, { allowUnknown: true });

      const {
        name,
        latitude,
        longitude,
        taxonomyIds,
      } = req.body;

      await models.LocationSuggestion.create({
        name,
        position: geometry.createPoint(longitude, latitude),
        taxonomy_ids: taxonomyIds,
      });
      res.sendStatus(201);
    } catch (err) {
      next(err);
    }
  },

  getInfo: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.getInfo, { allowUnknown: true });

      const location = await models.Location.findById(
        req.params.locationId,
        { include: [models.Service, models.Comment] },
      );
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      res.send(location);
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

      await location.createComment({
        content,
        posted_by: postedBy,
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
};
