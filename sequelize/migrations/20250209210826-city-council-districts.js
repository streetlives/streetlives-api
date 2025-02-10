
const DATASETS = [
  [
    'state_assembly_district',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Assembly_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'AssemDist',
  ],
  [
    'state_assembly_district_water_areas',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Assembly_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'AssemDist',
  ],
  [
    'us_congressional_district',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Congressional_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CongDist',
  ],
  [
    'us_congressional_district_water_areas',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Congressional_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CongDist',
  ],
  [
    'state_senate_district',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Senate_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'StSenDist',
  ],
  [
    'state_senate_district_water_areas',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Senate_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'StSenDist',
  ],
  [
    'municipal_court_district',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Municipal_Court_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'MuniCourt',
  ],
  [
    'municipal_court_district_water_areas',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Municipal_Court_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'MuniCourt',
  ],
  [
    'city_council_district',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_City_Council_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CounDist',
  ],
  [
    'city_council_district_water_areas',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_City_Council_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CounDist',
  ],
  [
    'election_district',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Election_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'ElectDist',
  ],
  [
    'election_district_water_areas',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Election_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'ElectDist',
  ],
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const existingEnumValues = (
      await queryInterface.sequelize.query(`SELECT unnest(
          enum_range(
            NULL::enum_nyc_districts_type))`)
    )[0].map(o => o.unnest);

    const data = [];
    for (const [type, url, prop] of DATASETS) {
      // if the enum already has this value, then skip him
      if (existingEnumValues.includes(type)) {
        // eslint-disable-next-line no-console
        console.log(`skip adding ${type} to enum`);
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line max-len
      await queryInterface.sequelize.query(`ALTER TYPE enum_nyc_districts_type ADD VALUE '${type}'`);

      const geojson =
        // eslint-disable-next-line no-undef
        await (await fetch(url)).json();

      data.push([type, geojson, prop]);
    }
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(data.map(([type, dataset, prop]) =>
        dataset.features.map((feature) => {
          const f = {
            ...feature,
            geometry: {
              ...feature.geometry,
              type: 'MultiPolygon',
              coordinates: feature.geometry.type === 'Polygon' ?
                [feature.geometry.coordinates] :
                feature.geometry.coordinates,
            },
          };
          return queryInterface.sequelize.query(
            'insert into nyc_districts values ($1, ST_GeomFromGeoJSON($2), $3)',
            {
              bind: [f.properties[prop], f.geometry, type],
              type: Sequelize.QueryTypes.INSERT,
            },
            { transaction: t },
          );
        })).reduce((a, b) => a.concat(b), [])));

    await queryInterface.sequelize.query(`
      create or replace view locations_geocoded_metadata as 
        select l.id as location_id, 
          neighborhoods.*, 
          boroughs.*, 
          school_district.school_district_id, 
          congressional_district.congressional_district_id, 
          community_district.community_district_id,
          state_assembly_district.
            state_assembly_district_id,
          state_assembly_district_water_areas.
            state_assembly_district_water_areas_district_id,
          us_congressional_district.
            us_congressional_district_id,
          us_congressional_district_water_areas.
            us_congressional_district_water_areas_district_id,
          state_senate_district.
            state_senate_district_id,
          state_senate_district_water_areas.
            state_senate_district_water_areas_district_id,
          municipal_court_district.
            municipal_court_district_id,
          municipal_court_district_water_areas.
            municipal_court_district_water_areas_district_id,
          city_council_district.
            city_council_district_id,
          city_council_district_water_areas.
            city_council_district_water_areas_district_id,
          election_district.
            election_district_id,
          election_district_water_areas.
            election_district_water_areas_district_id
        from locations l,
          lateral (
                SELECT nng.neighborhood from nyc_neighborhood_geometries nng
                  where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
          ) neighborhoods,
          lateral ( 
                SELECT nng.borough 
                   from nyc_neighborhood_geometries  nng
                   where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
          ) boroughs,
          lateral (
                SELECT  nd.district_id as school_district_id from nyc_districts nd
                  where 
                    ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'school'
          ) school_district,
          lateral (
                SELECT nd.district_id as congressional_district_id from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'congressional'
          ) congressional_district,
          lateral (
                SELECT nd.district_id as community_district_id from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'community'
          ) community_district,
          lateral (
                SELECT nd.district_id as state_assembly_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_assembly_district'
          ) state_assembly_district,
          lateral (
                SELECT nd.district_id as state_assembly_district_water_areas_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_assembly_district_water_areas'
          ) state_assembly_district_water_areas,
          lateral (
                SELECT nd.district_id as 
                us_congressional_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'us_congressional_district'
          ) us_congressional_district,
          lateral (
                SELECT nd.district_id as 
                us_congressional_district_water_areas_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'us_congressional_district_water_areas'
          ) us_congressional_district_water_areas,
          lateral (
                SELECT nd.district_id as state_senate_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_senate_district'
          ) state_senate_district,
          lateral (
                SELECT nd.district_id as state_senate_district_water_areas_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_senate_district_water_areas'
          ) state_senate_district_water_areas,
          lateral (
                SELECT nd.district_id as municipal_court_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'municipal_court_district'
          ) municipal_court_district,
          lateral (
                SELECT nd.district_id as municipal_court_district_water_areas_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'municipal_court_district_water_areas'
          ) municipal_court_district_water_areas,
          lateral (
                SELECT nd.district_id as city_council_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'city_council_district'
          ) city_council_district,
          lateral (
                SELECT nd.district_id as city_council_district_water_areas_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'city_council_district_water_areas'
          ) city_council_district_water_areas,
          lateral (
                SELECT nd.district_id as election_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'election_district'
          ) election_district,
          lateral (
                SELECT nd.district_id as election_district_water_areas_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'election_district_water_areas'
          ) election_district_water_areas
    `);
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.sequelize.query('drop view if exists locations_geocoded_metadata');

    await queryInterface.sequelize.query(`
      create view locations_geocoded_metadata as 
        select l.id as location_id, 
          neighborhoods.*, 
          boroughs.*, 
          school_districts.school_district_id, 
          congressional_districts.congressional_district_id, 
          community_districts.community_district_id 
        from locations l,
          lateral (
                SELECT nng.neighborhood from nyc_neighborhood_geometries nng
                  where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
          ) neighborhoods,
          lateral ( 
                SELECT nng.borough 
                   from nyc_neighborhood_geometries  nng
                   where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
          ) boroughs,
          lateral (
                SELECT  nd.district_id as school_district_id from nyc_districts nd
                  where 
                    ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'school'
          ) school_districts,
          lateral (
                SELECT nd.district_id as congressional_district_id from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'congressional'
          ) congressional_districts,
          lateral (
                SELECT nd.district_id as community_district_id from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'community'
          ) community_districts
    `);

    await queryInterface.sequelize.query(
      'delete from nyc_districts where type = any($1)',
      {
        bind: [DATASETS.map(d => d[0])],
        type: Sequelize.QueryTypes.DELETE,
      },
    );
  },
};
