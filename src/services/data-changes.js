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

export const destroyInstance = (user, instance, options = {}) =>
  startTransactionOrUseExisting(async (t) => {
    const { metadata = {} } = options;

    await instance.destroy({ transaction: t });

    await instance.createMetadatum({
      resource_id: instance.id,
      last_action_date: metadata.lastUpdated || new Date(),
      last_action_type: actionTypes.delete,
      updated_by: user,
      source: metadata.source,
    }, { transaction: t });
  }, options);

// The bulk counterpart of destroyInstance, for the delete-then-recreate updates: unlike
// Model.destroy({ where }), it leaves a delete record for every row it removes, so clearing a
// field shows up in the audit trail. `linkField` names the column tying the rows to their parent
// (e.g. 'service_id'); it is recorded as field_name, with the parent id as previous_value, so a
// lookup by parent still finds the delete once the row is gone.
export const destroyAllInstances = (user, model, where, options = {}) =>
  startTransactionOrUseExisting(async (t) => {
    const { metadata = {}, linkField } = options;

    const instances = await model.findAll({ where, transaction: t });
    if (!instances.length) {
      return;
    }

    // By id rather than `where`, so a row added after the lookup is neither deleted nor missed.
    await model.destroy({ where: { id: instances.map(({ id }) => id) }, transaction: t });

    await Promise.all(instances.map(instance => instance.createMetadatum({
      resource_id: instance.id,
      last_action_date: metadata.lastUpdated || new Date(),
      last_action_type: actionTypes.delete,
      field_name: linkField,
      previous_value: linkField && stringifyFieldValue(instance[linkField]),
      updated_by: user,
      source: metadata.source,
    }, { transaction: t })));
  }, options);
