/**
 * @jest-environment node
 */

import request from 'supertest';
import uuid from 'uuid/v4';
import app from '../../src/app';
import models from '../../src/models';

describe('get taxonomy', () => {
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

  const generateTestTaxonomy = ({ number, parent }) => ({
    id: uuid(),
    name: `taxonomy ${number}`,
    parent_id: parent ? parent.id : null,
    parent_name: parent ? parent.name : null,
  });

  const taxonomy1 = generateTestTaxonomy({ number: 1 });
  const taxonomy2 = generateTestTaxonomy({ number: 2 });
  const taxonomy3 = generateTestTaxonomy({ number: 3, parent: taxonomy1 });
  const taxonomy4 = generateTestTaxonomy({ number: 4, parent: taxonomy1 });
  const taxonomy5 = generateTestTaxonomy({ number: 5, parent: taxonomy2 });
  const taxonomy6 = generateTestTaxonomy({ number: 6, parent: taxonomy5 });

  const setupData = () => models.Taxonomy.bulkCreate([
    taxonomy1,
    taxonomy2,
    taxonomy3,
    taxonomy4,
    taxonomy5,
    taxonomy6,
  ]);

  beforeAll(setupData);

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
