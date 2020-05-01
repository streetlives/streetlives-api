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
  general,
  services,
  content,
}) => {
  const { slackWebhookUrl } = config;

  if (!slackWebhookUrl) {
    return Promise.resolve();
  }

  let text = `New error report for *${location.Organization.name}*\n"_${content}_"\n`;

  if (general) {
    text += 'Report relates to general location information.\n';
  }

  if (services.length) {
    text += `Services reported: ${services})\n`;
  }

  return axios.post(config.slackWebhookUrl, { text });
};

export default {
  notifyNewComment: async commentParams => notifyComment('New comment', commentParams),

  notifyReplyToComment: async ({
    originalComment,
    ...commentParams
  }) => notifyComment(`New reply to comment "${originalComment.content}"`, commentParams),

  notifyErrorReport,
};
