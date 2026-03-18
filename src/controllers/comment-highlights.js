/* eslint-disable no-console */

import Joi from 'joi';
import Sequelize from 'sequelize';
import models, { sequelize } from '../models';
import commentSchemas from './validation/comments';

let getCommentsHighlights = null;

const loadCommentsHighlights = () => {
  if (!getCommentsHighlights) {
    // eslint-disable-next-line global-require
    getCommentsHighlights = require('./openai').default;
  }
  return getCommentsHighlights;
};

async function doGenerateHighlights(results) {
  for (const location of results) {
    console.log(`Generating highlights for ${location.name}...`);

    const comments = await models.Comment.findAll({
      where: {
        location_id: location.id,
        reply_to_id: null,
        hidden: { [Sequelize.Op.or]: [null, false] },
        exclude: false,
      },
      attributes: ['id', 'content'],
    });

    const openAIOutput = await loadCommentsHighlights()(comments);

    // get the latest comment for this location
    const [lastComment] = await sequelize.query(
      `
      SELECT MAX(created_at) AS last_comment_timestamp
      FROM comments
      WHERE location_id = :location_id;
    `,
      {
        replacements: { location_id: location.id },
      },
    );

    // find if the highlight exists
    const existingHighlight = await models.LocationCommentHighlight.findOne({
      where: { location_id: location.id },
    });

    if (existingHighlight) {
      await existingHighlight.update({
        openai_output_json: openAIOutput,
        last_comment_timestamp: lastComment[0].last_comment_timestamp,
      });
    } else {
      await models.LocationCommentHighlight.create({
        location_id: location.id,
        last_comment_timestamp: lastComment[0].last_comment_timestamp,
        openai_output_json: openAIOutput,
      });
    }
  }
}

export function regenerateHighlightsForLocation(locationId) {
  return new Promise((resolve, reject) => {
    sequelize.query(`
      SELECT l.id, l.name
      FROM locations l
      WHERE l.id = :locationId
    `, {
      replacements: { locationId },
      type: Sequelize.QueryTypes.SELECT,
    })
      .then(async (results) => {
        await doGenerateHighlights(results);
        resolve();
      })
      .catch((err) => {
        console.error('Error regenerating highlights:', err);
        reject(err);
      });
  });
}

export default {
  generateHighlights: async (req, res, next) => {
    try {
      // find the locations tha needs to be reprocessed
      const [results] = await sequelize.query(`
          SELECT l.id, l.name
          FROM locations l
          JOIN comments c ON l.id = c.location_id
          LEFT JOIN location_comment_highlights lch ON l.id = lch.location_id
          WHERE lch.location_id IS NULL
             OR (SELECT MAX(c2.created_at)
                 FROM comments c2
                 WHERE c2.location_id = l.id) > lch.last_comment_timestamp
             AND c.reply_to_id is null
          GROUP BY l.id;
      `, {
        models: models.Location,
      });

      if (results.length === 0) {
        res.send('No new comments to process.');
        return;
      }

      await doGenerateHighlights(results);

      res.send('Highlights generated successfully.');
    } catch (err) {
      next(err);
    }
  },

  regenerateHighlights: async (req, res, next) => {
    try {
      // find the locations tha needs to be reprocessed
      const [results] = await sequelize.query(`
          SELECT l.id, l.name
          FROM locations l
          INNER JOIN comments c ON l.id = c.location_id
          and c.reply_to_id is null
      `, {
        models: models.Location,
      });

      await doGenerateHighlights(results);

      res.send('Highlights generated successfully.');
    } catch (err) {
      next(err);
    }
  },

  getHighlights: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;

      const highlights = await models.LocationCommentHighlight.findOne({
        where: { location_id: locationId },
        attributes: ['openai_output_json'],
      });

      if (!highlights) {
        res.status(404).send('Highlights not found for this location.');
        return;
      }

      const output = highlights.openai_output_json;

      res.send(output);
    } catch (err) {
      next(err);
    }
  },
};
