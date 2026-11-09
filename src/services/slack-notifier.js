import axios from 'axios';
import config from '../config';

const notifyComment = (baseText, {
  location,
  content,
  postedBy,
  contactInfo,
}) => {
  const { slackWebhookUrl } = config;

  if (!slackWebhookUrl) {
    return Promise.resolve();
  }

  let text = `${baseText} for *${location.Organization.name}*: "_${content}_"`;

  const posterInfo = [];
  if (postedBy) {
    posterInfo.push(`by _${postedBy}_`);
  }
  if (contactInfo) {
    posterInfo.push(`email/phone: ${contactInfo}`);
  }
  if (posterInfo.length) {
    text += ` (${posterInfo.join(', ')})`;
  }

  return axios.post(config.slackWebhookUrl, { text });
};

const notifyErrorReport = async ({
  location,
  content,
}) => {
  const { slackWebhookUrl } = config;

  if (!slackWebhookUrl) {
    return Promise.resolve();
  }

  const text = `New error report for *${location.Organization.name}*\n"_${content}_"\n`;

  return axios.post(config.slackWebhookUrl, { text });
};

const notifyLocationDeletionScheduled = async ({
  location,
  note,
  requestedBy,
  deletedServiceCount,
  scheduledForPermanentDeletionAt,
}) => {
  const { slackWebhookUrl } = config;

  if (!slackWebhookUrl) {
    return Promise.resolve();
  }

  const organizationName = location.Organization
    ? location.Organization.name
    : 'Unknown organization';
  const locationName = location.name || 'Unknown location';
  const scheduledDate = new Date(scheduledForPermanentDeletionAt).toISOString();
  const text = [
    `Location scheduled for deletion: *${organizationName}* / *${locationName}*`,
    `Requested by: ${requestedBy}`,
    `Deleted services immediately: ${deletedServiceCount}`,
    `Scheduled for permanent deletion: ${scheduledDate}`,
    `Reason: "_${note}_"`,
  ].join('\n');

  return axios.post(config.slackWebhookUrl, { text });
};

export default {
  notifyNewComment: async commentParams => notifyComment('New comment', commentParams),

  notifyReplyToComment: async ({
    originalComment,
    ...commentParams
  }) => notifyComment(`New reply to comment "${originalComment.content}"`, commentParams),

  notifyErrorReport,
  notifyLocationDeletionScheduled,
};
