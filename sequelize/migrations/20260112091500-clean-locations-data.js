import fs from 'fs';
import path from 'path';
import models from '../../src/models';
import { createInstance, updateInstance } from '../../src/services/data-changes';

const DATA_DIR = path.join(__dirname, 'data');

const readJson = filename =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));

const {
  serviceUpdates = [],
  phoneUpdates = [],
} = readJson('20260112-clean-text-phones.json');

const { locationUpdates = [] } = readJson('20260112-location-pipeline.json');

const METADATA = { source: 'migration' };

const buildAddressUpdate = (currentAddress, nextAddress) => {
  const update = {};
  if (nextAddress.street != null && nextAddress.street !== currentAddress.address_1) {
    update.address_1 = nextAddress.street;
  }
  if (nextAddress.city != null && nextAddress.city !== currentAddress.city) {
    update.city = nextAddress.city;
  }
  if (nextAddress.region != null && nextAddress.region !== currentAddress.region) {
    update.region = nextAddress.region;
  }
  if (nextAddress.state != null && nextAddress.state !== currentAddress.state_province) {
    update.state_province = nextAddress.state;
  }
  if (nextAddress.postalCode != null && nextAddress.postalCode !== currentAddress.postal_code) {
    update.postal_code = nextAddress.postalCode;
  }
  if (nextAddress.country != null && nextAddress.country !== currentAddress.country) {
    update.country = nextAddress.country;
  }
  return update;
};

const updateServiceEventInfo = async (serviceId, eventRelatedInfo) => {
  if (!eventRelatedInfo) {
    return;
  }
  const event = eventRelatedInfo.event;
  const information = eventRelatedInfo.information;
  if (!event || information == null) {
    return;
  }
  const existing = await models.EventRelatedInfo.findOne({
    where: {
      service_id: serviceId,
      event,
    },
  });

  if (existing) {
    if (existing.information !== information) {
      await updateInstance(
        '<System>',
        existing,
        { information },
        { metadata: METADATA },
      );
    }
    return;
  }

  await createInstance(
    '<System>',
    models.EventRelatedInfo.create.bind(models.EventRelatedInfo),
    {
      service_id: serviceId,
      event,
      information,
    },
    { metadata: METADATA },
  );
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const update of serviceUpdates) {
      const serviceId = update.service_id;
      const payload = update.payload || {};
      if (!serviceId || !payload) {
        continue;
      }

      const service = await models.Service.findByPk(serviceId);
      if (!service) {
        console.log('Skipping missing service', serviceId);
        continue;
      }

      if (payload.description != null && payload.description !== service.description) {
        await updateInstance(
          '<System>',
          service,
          { description: payload.description },
          { metadata: METADATA },
        );
      }

      await updateServiceEventInfo(serviceId, payload.eventRelatedInfo);
    }

    for (const update of phoneUpdates) {
      const phoneId = update.phone_id;
      const payload = update.payload || {};
      if (!phoneId || !payload) {
        continue;
      }

      const phone = await models.Phone.findByPk(phoneId);
      if (!phone) {
        console.log('Skipping missing phone', phoneId);
        continue;
      }

      if (payload.number != null && payload.number !== phone.number) {
        await updateInstance(
          '<System>',
          phone,
          { number: payload.number },
          { metadata: METADATA },
        );
      }
    }

    for (const update of locationUpdates) {
      const locationId = update.location_id;
      const payload = update.payload || {};
      if (!locationId || !payload) {
        continue;
      }

      const location = await models.Location.findByPk(locationId, {
        include: [models.PhysicalAddress],
      });

      if (!location) {
        console.log('Skipping missing location', locationId);
        continue;
      }

      if (payload.address) {
        const addresses = location.PhysicalAddresses || [];
        if (addresses.length !== 1) {
          console.log('Skipping address update with invalid address count', locationId);
        } else {
          const addressUpdate = buildAddressUpdate(addresses[0], payload.address);
          if (Object.keys(addressUpdate).length) {
            await updateInstance(
              '<System>',
              addresses[0],
              addressUpdate,
              { metadata: METADATA },
            );
          }
        }
      }

      if (payload.streetview_url != null && payload.streetview_url !== location.streetview_url) {
        await updateInstance(
          '<System>',
          location,
          { streetview_url: payload.streetview_url },
          { metadata: METADATA },
        );
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // No-op: original values were not captured for these data fixes.
  },
};
