module.exports = (sequelize, DataTypes) => {
  const ErrorReport = sequelize.define('ErrorReport', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    services: {
      // May need to create an index for this datatype (array of UUIDs) for look-ups
      // https://coderwall.com/p/1b5eyq/index-for-uuid-array-data-type

      type: DataTypes.ARRAY(DataTypes.UUID), // This could also be a JSONB data type?
    },
    content: DataTypes.TEXT,
    posted_by: DataTypes.TEXT,
    contact_info: DataTypes.TEXT,
    hidden: DataTypes.BOOLEAN,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  ErrorReport.associate = (models) => {
    ErrorReport.belongsTo(models.Location);
  };

  ErrorReport.findAllForLocation = (locationId, { attributes, order }) => ErrorReport.findAll({
    where: {
      location_id: locationId,
      hidden: { [sequelize.Op.or]: [false, null] },
    },
    attributes,
    order,
  });

  return ErrorReport;
};
