module.exports = (sequelize, DataTypes) => {
  const WebsiteData = sequelize.define('WebsiteData', {
    slug: DataTypes.TEXT,
    data: DataTypes.TEXT,
    updated_at: DataTypes.DATE,
    location_id: DataTypes.UUID,
  }, {
    tableName: 'website_data',
    timestamps: false,
    underscored: true,
    underscoredAll: true,
  });

  WebsiteData.associate = (models) => {
    WebsiteData.belongsTo(models.Location, {
      foreignKey: 'location_id',
      targetKey: 'id',
    });
  };

  return WebsiteData;
};
