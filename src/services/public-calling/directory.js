// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const { parseNumber, parseHref, linkedNumbers } = require('./phone');

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const unavailable = () =>
  Object.assign(new Error('This number is not available for browser calling.'), {
    status: 403,
    code: 'destination_unavailable',
  });

function createDirectory(models) {
  return async ({ locationId, serviceId, href }) => {
    if (!uuid.test(locationId || '') || (serviceId && !uuid.test(serviceId))) throw unavailable();
    const requested = parseHref(href);
    if (!requested) throw unavailable();
    // The default Location scope hides the publication flag. Explicitly fetch and check it.
    const location = await models.Location.unscoped().findByPk(locationId);
    if (!location || location.hidden_from_search === true || !location.slug) throw unavailable();
    const closure = await models.EventRelatedInfo.findOne({
      where: { location_id: locationId, event: 'CLOSURE' },
    });
    if (closure) throw unavailable();
    const links = [
      ...linkedNumbers(location.description),
      ...linkedNumbers(location.additional_info),
    ];
    const phoneWhere = [{ location_id: locationId }];
    if (serviceId) {
      const association = await models.ServiceAtLocation.findOne({
        where: { location_id: locationId, service_id: serviceId },
      });
      const service = association && (await models.Service.findByPk(serviceId));
      if (!service || service.organization_id !== location.organization_id) throw unavailable();
      const serviceClosure = await models.EventRelatedInfo.findOne({
        where: { service_id: serviceId, event: 'CLOSURE' },
      });
      if (serviceClosure) throw unavailable();
      links.push(
        ...linkedNumbers(service.description),
        ...linkedNumbers(service.additional_info),
        ...linkedNumbers(association.description),
      );
      phoneWhere.push({ service_id: serviceId }, { service_at_location_id: association.id });
    }
    // YourPeer also renders EventRelatedInfo.information as service/location info.
    const infoScope = [{ location_id: locationId }];
    if (serviceId) infoScope.push({ service_id: serviceId });
    const info = await models.EventRelatedInfo.findAll({
      where: { [models.Sequelize.Op.or]: infoScope },
    });
    info.forEach(value => links.push(...linkedNumbers(value.information)));
    const phones = await models.Phone.findAll({ where: { [models.Sequelize.Op.or]: phoneWhere } });
    phones.forEach((phone) => {
      const parsed = parseNumber(phone.number);
      if (parsed) {
        links.push({
          ...parsed,
          extension: phone.extension == null ? parsed.extension : String(phone.extension),
        });
      }
    });
    const found = links.find(phone =>
      phone.number === requested.number && phone.extension === requested.extension);
    if (!found) throw unavailable();
    return {
      ...found,
      locationId,
      serviceId: serviceId || null,
      href,
      locationSlug: location.slug,
    };
  };
}

module.exports = { createDirectory };
