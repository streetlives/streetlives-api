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

export default {
  notifyNewComment: async commentParams => notifyComment('New comment', commentParams),

  notifyReplyToComment: async ({
    originalComment,
    ...commentParams
  }) => notifyComment(`New reply to comment "${originalComment.content}"`, commentParams),
};
