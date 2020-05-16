import models from '../models';

const { sequelize } = models;
const { actionTypes } = models.Metadata;

const stringifyFieldValue = fieldValue =>
  (typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : fieldValue);

const startTransactionOrUseExisting = (callback, options) => {
  if (options && options.transaction) {
    return callback(options.transaction);
  }

  return sequelize.transaction(callback);
};

const createMetadataForFields = async ({
  user,
  actionType,
  values,
  previousValues,
  newInstance,
  customMetadata = {},
  t,
}) =>
  Promise.all(Object.keys(values).map(async (fieldName) => {
    if (!(fieldName in newInstance)) {
      return;
    }

    const previousValue = previousValues && stringifyFieldValue(previousValues[fieldName]);
    const replacementValue = stringifyFieldValue(newInstance[fieldName]);

    await newInstance.createMetadatum({
      resource_id: newInstance.id,
      last_action_date: customMetadata.lastUpdated || new Date(),
      last_action_type: actionType,
      field_name: fieldName,
      previous_value: previousValue,
      replacement_value: replacementValue,
      updated_by: user,
      source: customMetadata.source,
    }, { transaction: t });
  }));

export const createInstance = async (user, modelCreateFunction, values, options = {}) =>
  startTransactionOrUseExisting(async (t) => {
    const { metadata, ...createOptions } = options;

    const newInstance = await modelCreateFunction(values, {
      ...createOptions,
      transaction: t,
    });

    await createMetadataForFields({
      user,
      actionType: actionTypes.create,
      values,
      newInstance,
      customMetadata: metadata,
      t,
    });

    return newInstance;
  }, options);

export const updateInstance = async (user, instance, values, options = {}) =>
  startTransactionOrUseExisting(async (t) => {
    const { metadata, ...updateOptions } = options;

    const previousValues = { ...instance.get({ plain: true }) };

    const newInstance = await instance.update(values, {
      ...updateOptions,
      transaction: t,
    });

    await createMetadataForFields({
      user,
      actionType: actionTypes.update,
      values,
      previousValues,
      newInstance,
      customMetadata: metadata,
      t,
    });

    return newInstance;
  }, options);

export const destroyInstance = (user, instance) => startTransactionOrUseExisting(async (t) => {
  await instance.destroy({ transaction: t });

  await instance.createMetadatum({
    resource_id: instance.id,
    last_action_date: new Date(),
    last_action_type: actionTypes.delete,
    updated_by: user,
  }, { transaction: t });
});
