module.exports = (sequelize, DataTypes) => {
  const DocumentsInfo = sequelize.define('DocumentsInfo', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    recertification_time: DataTypes.TEXT,
    grace_period: DataTypes.TEXT,
    additional_info: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  DocumentsInfo.associate = (models) => {
    DocumentsInfo.belongsTo(models.Service);
  };

  return DocumentsInfo;
};
