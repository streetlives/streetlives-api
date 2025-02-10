
const DATASETS = [
  [
    'state_assembly_districts_clipped_to_shoreline',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Assembly_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'AssemDist',
  ],
  [
    'state_assembly_districts_water_areas_included',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Assembly_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'AssemDist',
  ],
  [
    'us_congressional_districts_clipped_to_shoreline',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Congressional_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CongDist',
  ],
  [
    'us_congressional_districts_water_areas_included',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Congressional_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CongDist',
  ],
  [
    'state_senate_districts_clipped_to_shoreline',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Senate_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'StSenDist',
  ],
  [
    'state_senate_districts_water_areas_included',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_State_Senate_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'StSenDist',
  ],
  [
    'municipal_court_districts_clipped_to_shoreline',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Municipal_Court_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'MuniCourt',
  ],
  [
    'municipal_court_districts_water_areas_included',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Municipal_Court_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'MuniCourt',
  ],
  [
    'city_council_districts_clipped_to_shoreline',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_City_Council_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CounDist',
  ],
  [
    'city_council_districts_water_areas_included',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_City_Council_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'CounDist',
  ],
  [
    'election_districts_clipped_to_shoreline',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Election_Districts/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'ElectDist',
  ],
  [
    'election_districts_water_areas_included',
    // eslint-disable-next-line max-len
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Election_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson',
    'ElectDist',
  ],
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      create or replace view locations_geocoded_metadata as 
        select l.id as location_id, 
          neighborhoods.*, 
          boroughs.*, 
          school_districts.school_district_id, 
          congressional_districts.congressional_district_id, 
          community_districts.community_district_id,
          state_assembly_districts_clipped_to_shoreline.
            state_assembly_districts_clipped_to_shoreline_district_id,
          state_assembly_districts_water_areas_included.
            state_assembly_districts_water_areas_included_district_id,
          us_congressional_districts_clipped_to_shoreline.
            us_congressional_districts_clipped_to_shoreline_district_id,
          us_congressional_districts_water_areas_included.
            us_congressional_districts_water_areas_included_district_id,
          state_senate_districts_clipped_to_shoreline.
            state_senate_districts_clipped_to_shoreline_district_id,
          state_senate_districts_water_areas_included.
            state_senate_districts_water_areas_included_district_id,
          municipal_court_districts_clipped_to_shoreline.
            municipal_court_districts_clipped_to_shoreline_district_id,
          municipal_court_districts_water_areas_included.
            municipal_court_districts_water_areas_included_district_id,
          city_council_districts_clipped_to_shoreline.
            city_council_districts_clipped_to_shoreline_district_id,
          city_council_districts_water_areas_included.
            city_council_districts_water_areas_included_district_id,
          election_districts_clipped_to_shoreline.
            election_districts_clipped_to_shoreline_district_id,
          election_districts_water_areas_included.
            election_districts_water_areas_included_district_id
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
          ) community_districts,
          lateral (
                SELECT nd.district_id as state_assembly_districts_clipped_to_shoreline_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_assembly_districts_clipped_to_shoreline'
          ) state_assembly_districts_clipped_to_shoreline,
          lateral (
                SELECT nd.district_id as state_assembly_districts_water_areas_included_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_assembly_districts_water_areas_included'
          ) state_assembly_districts_water_areas_included,
          lateral (
                SELECT nd.district_id as 
                us_congressional_districts_clipped_to_shoreline_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'us_congressional_districts_clipped_to_shoreline'
          ) us_congressional_districts_clipped_to_shoreline,
          lateral (
                SELECT nd.district_id as 
                us_congressional_districts_water_areas_included_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'us_congressional_districts_water_areas_included'
          ) us_congressional_districts_water_areas_included,
          lateral (
                SELECT nd.district_id as state_senate_districts_clipped_to_shoreline_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_senate_districts_clipped_to_shoreline'
          ) state_senate_districts_clipped_to_shoreline,
          lateral (
                SELECT nd.district_id as state_senate_districts_water_areas_included_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'state_senate_districts_water_areas_included'
          ) state_senate_districts_water_areas_included,
          lateral (
                SELECT nd.district_id as municipal_court_districts_clipped_to_shoreline_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'municipal_court_districts_clipped_to_shoreline'
          ) municipal_court_districts_clipped_to_shoreline,
          lateral (
                SELECT nd.district_id as municipal_court_districts_water_areas_included_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'municipal_court_districts_water_areas_included'
          ) municipal_court_districts_water_areas_included,
          lateral (
                SELECT nd.district_id as city_council_districts_clipped_to_shoreline_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'city_council_districts_clipped_to_shoreline'
          ) city_council_districts_clipped_to_shoreline,
          lateral (
                SELECT nd.district_id as city_council_districts_water_areas_included_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'city_council_districts_water_areas_included'
          ) city_council_districts_water_areas_included,
          lateral (
                SELECT nd.district_id as election_districts_clipped_to_shoreline_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'election_districts_clipped_to_shoreline'
          ) election_districts_clipped_to_shoreline,
          lateral (
                SELECT nd.district_id as election_districts_water_areas_included_district_id 
                from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'election_districts_water_areas_included'
          ) election_districts_water_areas_included
    `);

    const data = [];
    for (const [type, url, prop] of DATASETS) {
      // postgres does not allow you to remove values from enum, so we just wrap this in a try-catch
      try {
        // eslint-disable-next-line max-len
        await queryInterface.sequelize.query(`ALTER TYPE enum_nyc_districts_type ADD VALUE '${type}'`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }

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
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */

    await queryInterface.sequelize.query(`
      create or replace view locations_geocoded_metadata as 
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
