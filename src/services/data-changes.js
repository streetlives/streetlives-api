import models from '../models';

const { sequelize } = models;
const { actionTypes } = models.Metadata;

// TODO: Request objects need to actually have a user on them. Shouldn't even have a default.

const stringifyFieldValue = fieldValue =>
  (typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : fieldValue);

const createMetadataForFields = async (req, actionType, values, previousValues, newInstance, t) =>
  Promise.all(Object.keys(values).map(async (fieldName) => {
    if (!(fieldName in newInstance)) {
      return;
    }

    const previousValue = previousValues && stringifyFieldValue(previousValues[fieldName]);
    const replacementValue = stringifyFieldValue(newInstance[fieldName]);

    await newInstance.createMetadatum({
      resource_id: newInstance.id,
      last_action_date: new Date(),
      last_action_type: actionType,
      field_name: fieldName,
      previous_value: previousValue,
      replacement_value: replacementValue,
      updated_by: req.user || '<Unknown>',
    }, { transaction: t });
  }));

export const createInstance = async (req, modelCreateFunction, values, options) =>
  sequelize.transaction(async (t) => {
    const newInstance = await modelCreateFunction(values, {
      ...options,
      transaction: t,
    });

    await createMetadataForFields(req, actionTypes.create, values, null, newInstance, t);

    return newInstance;
  });

export const updateInstance = async (req, instance, values, options) =>
  sequelize.transaction(async (t) => {
    const previousValues = { ...instance.get({ plain: true }) };

    const newInstance = await instance.update(values, {
      ...options,
      transaction: t,
    });

    await createMetadataForFields(req, actionTypes.update, values, previousValues, newInstance, t);

    return newInstance;
  });

export const destroyInstance = (req, instance) => sequelize.transaction(async (t) => {
  await instance.destroy({ transaction: t });

  await instance.createMetadatum({
    resource_id: instance.id,
    last_action_date: new Date(),
    last_action_type: actionTypes.delete,
    updated_by: req.user || '<Unknown>',
  }, { transaction: t });
});
