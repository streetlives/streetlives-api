import request from 'supertest';
import uuid from 'uuid/v4';
import app from '../../src';
import models from '../../src/models';

describe('get taxonomy', () => {
  const taxonomy1 = {
    id: uuid(),
    name: 'taxonomy 1',
    parent_id: null,
    parent_name: null,
  };
  const taxonomy2 = {
    id: uuid(),
    name: 'taxonomy 2',
    parent_id: null,
    parent_name: null,
  };
  const taxonomy3 = {
    id: uuid(),
    name: 'taxonomy 3',
    parent_id: taxonomy1.id,
    parent_name: taxonomy1.name,
  };
  const taxonomy4 = {
    id: uuid(),
    name: 'taxonomy 4',
    parent_id: taxonomy1.id,
    parent_name: taxonomy1.name,
  };
  const taxonomy5 = {
    id: uuid(),
    name: 'taxonomy 5',
    parent_id: taxonomy2.id,
    parent_name: taxonomy2.name,
  };
  const taxonomy6 = {
    id: uuid(),
    name: 'taxonomy 6',
    parent_id: taxonomy5.id,
    parent_name: taxonomy5.name,
  };

  const setupData = () => models.Taxonomy.bulkCreate([
    taxonomy1,
    taxonomy2,
    taxonomy3,
    taxonomy4,
    taxonomy5,
    taxonomy6,
  ]);

  const stripTimestamps = (obj) => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Array) {
      return obj.map(stripTimestamps);
    }

    return Object.keys(obj).reduce((currStrippedObj, key) => {
      const value = obj[key];

      if (key.includes('_at')) {
        return currStrippedObj;
      }

      return { ...currStrippedObj, [key]: stripTimestamps(value) };
    }, {});
  };

  beforeAll(() => models.sequelize.sync({ force: true }).then(setupData));
  afterAll(() => {
    models.sequelize.close();
    app.server.close();
  });

  it('should return all taxonomy objects in a hierarchical structure', () =>
    request(app)
      .get('/taxonomy')
      .expect(200)
      .then((res) => {
        const taxonomy = stripTimestamps(res.body);
        expect(taxonomy).toEqual([
          {
            ...taxonomy1,
            children: [
              taxonomy3,
              taxonomy4,
            ],
          },
          {
            ...taxonomy2,
            children: [
              {
                ...taxonomy5,
                children: [
                  taxonomy6,
                ],
              },
            ],
          },
        ]);
      }));
});
