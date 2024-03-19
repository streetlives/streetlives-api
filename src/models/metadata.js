module.exports = (sequelize, DataTypes, Op) => {
  const actionTypes = {
    create: 'create',
    update: 'update',
    delete: 'delete',
  };

  const Metadata = sequelize.define('Metadata', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    resource_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    resource_table: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    last_action_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    last_action_type: {
      type: DataTypes.ENUM,
      values: Object.values(actionTypes),
      allowNull: false,
    },
    field_name: DataTypes.TEXT,
    previous_value: DataTypes.TEXT,
    replacement_value: DataTypes.TEXT,
    updated_by: DataTypes.TEXT,
    source: DataTypes.TEXT,
  }, {
    tableName: 'metadata',
    underscored: true,
    underscoredAll: true,
  });

  Metadata.actionTypes = actionTypes;

  Metadata.associate = (models) => {
    Object.keys(models).forEach((modelKey) => {
      const model = models[modelKey];

      if (model !== models.Metadata) {
        Metadata.belongsTo(model, { foreignKey: 'resource_id', constraints: false });
        model.hasMany(Metadata, {
          foreignKey: 'resource_id',
          constraints: false,
          scope: {
            resource_table: model.tableName,
          },
        });
      }
    });
  };

  Metadata.getLastUpdateDatesForResourceFields = resourceId => { 
    console.log('here resourceId ', resourceId);
    return Metadata.findAll({
      attributes: [
        'field_name',
        [sequelize.fn('MAX', sequelize.col('last_action_date')), 'last_action_date'],
      ],
      where: { resource_id: resourceId },
      group: 'field_name',
    });
  }

  Metadata.getLatestUpdateDateForQuery = where => Metadata.max('last_action_date', { where });

  Metadata.getLatestUpdateDateForResource = resourceId => Metadata.getLatestUpdateDateForQuery({
    resource_id: resourceId,
  });

  Metadata.getLatestUpdateDateForResources = resourceIds => Metadata.getLatestUpdateDateForQuery({
    resource_id: { [Op.in]: resourceIds },
  });

  Metadata.getSourcesForResources = async (resourceIds) => {
    const rows = await Metadata.findAll({
      attributes: [
        [sequelize.fn('DISTINCT', sequelize.col('source')), 'source'],
      ],
      where: {
        resource_id: { [Op.in]: resourceIds },
        source: { [Op.ne]: null },
      },
    });
    return rows.map(({ source }) => source);
  };

  return Metadata;
};
